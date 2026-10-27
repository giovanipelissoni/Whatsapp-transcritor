import 'dotenv/config';
import makeWASocket, {
    useMultiFileAuthState,
    downloadMediaMessage,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import Groq, { toFile } from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

// Validação da API Key da Groq
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey || apiKey === 'SUA_CHAVE_GROQ_AQUI') {
    console.error('\n❌ ERRO: GROQ_API_KEY não foi configurada!');
    console.error('👉 Crie uma chave gratuita em: https://console.groq.com/keys');
    console.error('👉 Cole a chave no arquivo .env (GROQ_API_KEY=sua_chave)\n');
    process.exit(1);
}

const groq = new Groq({ apiKey });

const processedIds = new Set();

function getMessageTimestampSeconds(rawMsg) {
    if (!rawMsg || !rawMsg.messageTimestamp) return Math.floor(Date.now() / 1000);
    if (typeof rawMsg.messageTimestamp === 'object' && typeof rawMsg.messageTimestamp.toNumber === 'function') {
        return rawMsg.messageTimestamp.toNumber();
    }
    return Number(rawMsg.messageTimestamp) || Math.floor(Date.now() / 1000);
}

/**
 * Função para desempacotar mensagens especiais do WhatsApp (viewOnce, ephemeral, etc.)
 */
function getNormalizedMessage(message) {
    if (!message) return null;
    if (message.ephemeralMessage) return getNormalizedMessage(message.ephemeralMessage.message);
    if (message.viewOnceMessage) return getNormalizedMessage(message.viewOnceMessage.message);
    if (message.viewOnceMessageV2) return getNormalizedMessage(message.viewOnceMessageV2.message);
    return message;
}

/**
 * Envia o buffer de áudio (.ogg) para a Groq transcrever via Whisper Large v3
 */
async function transcreverAudio(bufferAudio) {
    try {
        const file = await toFile(bufferAudio, 'audio.ogg', { type: 'audio/ogg' });
        const response = await groq.audio.transcriptions.create({
            file: file,
            model: 'whisper-large-v3',
            language: 'pt',
            response_format: 'text',
            temperature: 0.2
        });
        return response.trim();
    } catch (err) {
        // Fallback gravando arquivo temporário caso toFile em memória tenha problemas
        const tempPath = path.resolve(`./temp_${Date.now()}.ogg`);
        try {
            fs.writeFileSync(tempPath, bufferAudio);
            const response = await groq.audio.transcriptions.create({
                file: fs.createReadStream(tempPath),
                model: 'whisper-large-v3',
                language: 'pt',
                response_format: 'text',
                temperature: 0.2
            });
            return response.trim();
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
    }
}

async function startBot() {
    console.log('🔄 Inicializando cliente do WhatsApp...');

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'error' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        getMessage: async () => ({ conversation: '' })
    });

    sock.ev.on('creds.update', saveCreds);

    // Gerenciador de Conexão e QR Code
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n======================================================');
            console.log('📱 ESCANEIE O QR CODE ABAIXO NO SEU WHATSAPP:');
            console.log('(WhatsApp > Aparelhos conectados > Conectar um aparelho)');
            console.log('======================================================\n');
            qrcodeTerminal.generate(qr, { small: true });

            // Também salva uma imagem qrcode.png e tenta abrir no Windows para facilitar
            try {
                const qrImagePath = path.resolve('./qrcode.png');
                await QRCode.toFile(qrImagePath, qr, { scale: 8 });
                console.log(`\n🖼️ Imagem do QR Code salva em: ${qrImagePath}`);
                exec(`start "" "${qrImagePath}"`);
            } catch (e) {
                // silencioso se falhar ao abrir imagem
            }
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output?.statusCode
                : null;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            const isRestartRequired = statusCode === DisconnectReason.restartRequired;
            
            console.log(`⚠️ Conexão encerrada. Motivo: ${statusCode || 'desconhecido'}. Reconectar: ${shouldReconnect}`);
            if (shouldReconnect) {
                const delay = isRestartRequired ? 500 : 3000;
                setTimeout(() => startBot(), delay);
            } else {
                console.log('❌ Sessão desconectada/revogada. Exclua a pasta auth_info e reinicie para ler o QR Code novamente.');
            }
        } else if (connection === 'open') {
            console.log('\n✅ CONECTADO COM SUCESSO AO WHATSAPP!');
            console.log('🎧 Monitorando áudios no privado (recebidos e enviados)...');
            console.log('👥 Em grupos, use /transcrever respondendo a um áudio.\n');

            // Remove o qrcode.png temporário após conectar
            const qrImagePath = path.resolve('./qrcode.png');
            if (fs.existsSync(qrImagePath)) {
                try { fs.unlinkSync(qrImagePath); } catch {}
            }
        }
    });

    // Monitoramento de Mensagens
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const rawMsg of messages) {
            if (!rawMsg.message) continue;

            const remoteJid = rawMsg.key.remoteJid;
            // Ignora transmissões de status
            if (remoteJid === 'status@broadcast') continue;

            const msgId = rawMsg.key.id;
            if (!msgId) continue;

            const isGroup = remoteJid.endsWith('@g.us');
            const fromMe = rawMsg.key.fromMe;
            const message = getNormalizedMessage(rawMsg.message);
            if (!message) continue;

            const audioMsg = message.audioMessage;
            const textMsg = (message.conversation || message.extendedTextMessage?.text || '').trim();
            const contextInfo = message.extendedTextMessage?.contextInfo;
            const quotedMessage = getNormalizedMessage(contextInfo?.quotedMessage);

            const isTranscribeCommand = textMsg.toLowerCase().startsWith('/transcrever');

            // Comandos só podem ser executados pelo próprio usuário
            if (isTranscribeCommand && !fromMe) {
                continue;
            }

            // =========================================================================
            // REGRA 1: COMANDO /transcrever (Funciona em TODAS as conversas: Privado e Grupos)
            // =========================================================================
            if (isTranscribeCommand && quotedMessage?.audioMessage) {
                if (processedIds.has(msgId)) continue;
                const nowSec = Math.floor(Date.now() / 1000);
                const cmdSec = getMessageTimestampSeconds(rawMsg);
                if (nowSec - cmdSec > 180) continue;

                processedIds.add(msgId);
                if (contextInfo?.stanzaId) processedIds.add(contextInfo.stanzaId);

                console.log(`🎙️ Comando /transcrever detectado em ${remoteJid} (${isGroup ? 'Grupo' : 'Privado'})`);

                try {
                    // Reage com ampulheta no comando
                    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: rawMsg.key } });

                    // Monta o objeto de mensagem citada para o Baileys conseguir baixar
                    const quotedMsgObj = {
                        key: {
                            remoteJid: remoteJid,
                            id: contextInfo.stanzaId,
                            ...(contextInfo.participant ? { participant: contextInfo.participant } : {})
                        },
                        message: quotedMessage
                    };

                    const buffer = await downloadMediaMessage(quotedMsgObj, 'buffer', {});
                    const texto = await transcreverAudio(buffer);

                    if (texto && texto.length > 0) {
                        await sock.sendMessage(remoteJid, {
                            text: `🎙️ *Transcrição do áudio:*\n\n${texto}`
                        }, { quoted: rawMsg });

                        // Reage com check verde no comando
                        await sock.sendMessage(remoteJid, { react: { text: '✅', key: rawMsg.key } });
                    } else {
                        await sock.sendMessage(remoteJid, { react: { text: '❓', key: rawMsg.key } });
                    }
                } catch (err) {
                    console.error('❌ Erro ao transcrever áudio via comando:', err.message);
                    await sock.sendMessage(remoteJid, { react: { text: '❌', key: rawMsg.key } });
                }
                continue;
            }

            // =========================================================================
            // REGRA 2: PRIVADO - Transcrição automática de áudios (apenas áudios novos)
            // =========================================================================
            if (!isGroup && audioMsg) {
                if (processedIds.has(msgId)) continue;

                // Ignora mensagens antigas sincronizadas pós-reconexão (> 180 segundos)
                const nowSec = Math.floor(Date.now() / 1000);
                const msgSec = getMessageTimestampSeconds(rawMsg);
                if (nowSec - msgSec > 180) {
                    continue;
                }

                processedIds.add(msgId);
                console.log(`🎙️ [Privado] Áudio detectado em ${remoteJid} (Enviado por mim: ${fromMe})`);
                
                try {
                    // Reage com ampulheta para indicar processamento
                    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: rawMsg.key } });

                    const buffer = await downloadMediaMessage(rawMsg, 'buffer', {});
                    const texto = await transcreverAudio(buffer);

                    if (texto && texto.length > 0) {
                        await sock.sendMessage(remoteJid, {
                            text: `🎙️ *Transcrição:*\n\n${texto}`
                        }, { quoted: rawMsg });

                        // Reage com check verde
                        await sock.sendMessage(remoteJid, { react: { text: '✅', key: rawMsg.key } });
                    } else {
                        await sock.sendMessage(remoteJid, { react: { text: '❓', key: rawMsg.key } });
                    }
                } catch (err) {
                    console.error('❌ Erro ao transcrever áudio privado:', err.message);
                    await sock.sendMessage(remoteJid, { react: { text: '❌', key: rawMsg.key } });
                }
                continue;
            }
                        await sock.sendMessage(remoteJid, {
                            text: `🎙️ *Transcrição:*\n\n${texto}`
                        }, { quoted: rawMsg });

                        // Reage com check verde
                        await sock.sendMessage(remoteJid, { react: { text: '✅', key: rawMsg.key } });
                    } else {
                        await sock.sendMessage(remoteJid, { react: { text: '❓', key: rawMsg.key } });
                    }
                } catch (err) {
                    console.error('❌ Erro ao transcrever áudio privado:', err.message);
                    await sock.sendMessage(remoteJid, { react: { text: '❌', key: rawMsg.key } });
                }
                continue;
            }
        }
    });
}

// Inicia o bot
startBot().catch((err) => {
    console.error('Erro fatal ao iniciar bot:', err);
});
