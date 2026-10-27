import EventEmitter from 'events';
import 'dotenv/config';
import makeWASocket, {
    useMultiFileAuthState,
    downloadMediaMessage,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import Groq, { toFile } from 'groq-sdk';
import fs from 'fs';
import path from 'path';

export class BotManager extends EventEmitter {
    constructor() {
        super();
        this.status = 'STOPPED'; // 'STOPPED' | 'STARTING' | 'WAITING_QR' | 'CONNECTED' | 'ERROR'
        this.qrCodeDataUrl = null;
        this.rawQr = null;
        this.connectedUser = null;
        this.sock = null;
        this.isTranscribingEnabled = true;
        this.intentionallyStopped = false;

        this.config = {
            transcribePrivateAudio: true,
            transcribeMyOwnAudio: true,
            groupMode: 'command' // 'command' | 'always' | 'disabled'
        };

        this.stats = {
            totalTranscribed: 0,
            totalErrors: 0,
            startedAt: null
        };

        this.recentTranscriptions = [];

        // Inicializa Groq SDK
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey || apiKey === 'SUA_CHAVE_GROQ_AQUI') {
            this.groq = null;
            this.addLog('warn', 'GROQ_API_KEY não configurada ou inválida no .env');
        } else {
            this.groq = new Groq({ apiKey });
        }
    }

    addLog(level, message, data = null) {
        const logEntry = {
            id: Date.now() + Math.random().toString(36).substring(2, 7),
            timestamp: new Date().toISOString(),
            level,
            message,
            data
        };
        console.log(`[${new Date().toLocaleTimeString()}] [${level.toUpperCase()}] ${message}`);
        this.emit('log', logEntry);
    }

    setStatus(newStatus, extra = {}) {
        this.status = newStatus;
        if (extra.qrCodeDataUrl !== undefined) this.qrCodeDataUrl = extra.qrCodeDataUrl;
        if (extra.connectedUser !== undefined) this.connectedUser = extra.connectedUser;
        this.emit('status_change', this.getStatus());
    }

    getStatus() {
        return {
            status: this.status,
            qrCodeDataUrl: this.qrCodeDataUrl,
            connectedUser: this.connectedUser,
            isTranscribingEnabled: this.isTranscribingEnabled,
            config: this.config,
            stats: this.stats,
            hasGroqKey: Boolean(this.groq)
        };
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.emit('config_updated', this.config);
        this.addLog('info', 'Configurações atualizadas');
        return this.config;
    }

    setTranscribingEnabled(enabled) {
        this.isTranscribingEnabled = Boolean(enabled);
        this.emit('status_change', this.getStatus());
        this.addLog('info', `Transcritor de áudio ${this.isTranscribingEnabled ? 'ATIVADO' : 'PAUSADO'}`);
        return this.isTranscribingEnabled;
    }

    getNormalizedMessage(message) {
        if (!message) return null;
        if (message.ephemeralMessage) return this.getNormalizedMessage(message.ephemeralMessage.message);
        if (message.viewOnceMessage) return this.getNormalizedMessage(message.viewOnceMessage.message);
        if (message.viewOnceMessageV2) return this.getNormalizedMessage(message.viewOnceMessageV2.message);
        return message;
    }

    async transcreverAudio(bufferAudio) {
        if (!this.groq) {
            throw new Error('GROQ_API_KEY não configurada no servidor (.env)');
        }

        try {
            const file = await toFile(bufferAudio, 'audio.ogg', { type: 'audio/ogg' });
            const response = await this.groq.audio.transcriptions.create({
                file: file,
                model: 'whisper-large-v3',
                language: 'pt',
                response_format: 'text',
                temperature: 0.2
            });
            return response.trim();
        } catch (err) {
            // Fallback gravando arquivo temporário em disco se o buffer em memória falhar
            const tempPath = path.resolve(`./temp_${Date.now()}.ogg`);
            try {
                fs.writeFileSync(tempPath, bufferAudio);
                const response = await this.groq.audio.transcriptions.create({
                    file: fs.createReadStream(tempPath),
                    model: 'whisper-large-v3',
                    language: 'pt',
                    response_format: 'text',
                    temperature: 0.2
                });
                return response.trim();
            } finally {
                if (fs.existsSync(tempPath)) {
                    try { fs.unlinkSync(tempPath); } catch {}
                }
            }
        }
    }

    async start() {
        if (this.status === 'CONNECTED' || this.status === 'STARTING') {
            this.addLog('info', 'Bot já está em execução ou inicializando.');
            return;
        }

        this.intentionallyStopped = false;
        this.setStatus('STARTING', { qrCodeDataUrl: null });
        this.addLog('info', 'Iniciando conexão do WhatsApp...');

        try {
            const authDir = path.resolve('./auth_info');
            if (!fs.existsSync(authDir)) {
                fs.mkdirSync(authDir, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            const { version } = await fetchLatestBaileysVersion();

            this.sock = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: ['Transcritor Web', 'Chrome', '2.0.0']
            });

            this.sock.ev.on('creds.update', saveCreds);

            // Gerenciamento do ciclo de conexão
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.rawQr = qr;
                    try {
                        const qrDataUrl = await QRCode.toDataURL(qr, {
                            margin: 2,
                            scale: 8,
                            color: {
                                dark: '#111827',
                                light: '#ffffff'
                            }
                        });
                        this.setStatus('WAITING_QR', { qrCodeDataUrl: qrDataUrl });
                        this.addLog('info', 'Novo QR Code gerado para conexão.');
                    } catch (e) {
                        this.addLog('error', `Falha ao gerar QR Code Data URL: ${e.message}`);
                    }
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error instanceof Boom)
                        ? lastDisconnect.error.output?.statusCode
                        : null;
                    const loggedOut = statusCode === DisconnectReason.loggedOut;

                    this.addLog('warn', `Conexão encerrada. Código: ${statusCode || 'desconhecido'}.`);

                    if (this.intentionallyStopped) {
                        this.setStatus('STOPPED', { qrCodeDataUrl: null, connectedUser: null });
                        this.addLog('info', 'Bot foi desligado manualmente pelo usuário.');
                        return;
                    }

                    if (loggedOut) {
                        this.setStatus('STOPPED', { qrCodeDataUrl: null, connectedUser: null });
                        this.addLog('error', 'Sessão desvinculada pelo WhatsApp. Conecte novamente pelo QR Code.');
                        this.cleanAuthInfo();
                    } else {
                        // Reconexão automática em caso de queda de rede temporária
                        this.setStatus('STARTING');
                        this.addLog('info', 'Tentando reconectar em 3 segundos...');
                        setTimeout(() => {
                            if (!this.intentionallyStopped) this.start();
                        }, 3000);
                    }
                } else if (connection === 'open') {
                    const user = this.sock.user || {};
                    const phone = user.id ? user.id.split(':')[0] : '';
                    const connectedUser = {
                        id: user.id,
                        name: user.name || 'Usuário WhatsApp',
                        phone: phone
                    };

                    this.setStatus('CONNECTED', { qrCodeDataUrl: null, connectedUser });
                    this.stats.startedAt = new Date().toISOString();
                    this.addLog('info', `WhatsApp Conectado com sucesso! Usuário: ${connectedUser.name} (+${connectedUser.phone})`);
                }
            });

            // Tratamento de mensagens recebidas
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                for (const rawMsg of messages) {
                    await this.handleMessage(rawMsg);
                }
            });

        } catch (error) {
            this.setStatus('ERROR');
            this.addLog('error', `Erro ao inicializar WhatsApp: ${error.message}`);
        }
    }

    async handleMessage(rawMsg) {
        if (!rawMsg.message) return;

        const remoteJid = rawMsg.key.remoteJid;
        if (!remoteJid || remoteJid === 'status@broadcast') return;

        const isGroup = remoteJid.endsWith('@g.us');
        const fromMe = Boolean(rawMsg.key.fromMe);
        const message = this.getNormalizedMessage(rawMsg.message);
        if (!message) return;

        const audioMsg = message.audioMessage;
        const textMsg = (message.conversation || message.extendedTextMessage?.text || '').trim();
        const contextInfo = message.extendedTextMessage?.contextInfo;
        const quotedMessage = this.getNormalizedMessage(contextInfo?.quotedMessage);

        // Se transcrições estiverem pausadas globalmente, ignora processamento de áudio
        if (!this.isTranscribingEnabled) {
            return;
        }

        // =========================================================================
        // REGRA 1: PRIVADO (DMs)
        // =========================================================================
        if (!isGroup && audioMsg && this.config.transcribePrivateAudio) {
            if (fromMe && !this.config.transcribeMyOwnAudio) {
                return; // Usuário desativou transcrição dos próprios áudios
            }

            await this.processAudioMessage({
                targetJid: remoteJid,
                rawMsgToDownload: rawMsg,
                quoteMsgToReply: rawMsg,
                reactionKey: rawMsg.key,
                fromMe,
                isGroup: false,
                sender: remoteJid.replace('@s.whatsapp.net', '')
            });
            return;
        }

        // =========================================================================
        // REGRA 2: GRUPOS
        // =========================================================================
        if (isGroup) {
            if (this.config.groupMode === 'disabled') {
                return;
            }

            // Modo 1: Responder com /transcrever citando o áudio
            if (this.config.groupMode === 'command' && textMsg.toLowerCase().startsWith('/transcrever') && quotedMessage?.audioMessage) {
                const quotedMsgObj = {
                    key: {
                        remoteJid: remoteJid,
                        id: contextInfo.stanzaId,
                        participant: contextInfo.participant
                    },
                    message: quotedMessage
                };

                await this.processAudioMessage({
                    targetJid: remoteJid,
                    rawMsgToDownload: quotedMsgObj,
                    quoteMsgToReply: rawMsg,
                    reactionKey: rawMsg.key,
                    fromMe,
                    isGroup: true,
                    sender: contextInfo.participant || remoteJid,
                    isReplyToCommand: true
                });
                return;
            }

            // Modo 2: Transcrever sempre (se configurado como 'always')
            if (this.config.groupMode === 'always' && audioMsg) {
                await this.processAudioMessage({
                    targetJid: remoteJid,
                    rawMsgToDownload: rawMsg,
                    quoteMsgToReply: rawMsg,
                    reactionKey: rawMsg.key,
                    fromMe,
                    isGroup: true,
                    sender: rawMsg.key.participant || remoteJid
                });
                return;
            }
        }
    }

    async processAudioMessage({ targetJid, rawMsgToDownload, quoteMsgToReply, reactionKey, fromMe, isGroup, sender }) {
        const item = {
            id: 'tr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
            timestamp: new Date().toISOString(),
            targetJid,
            sender,
            isGroup,
            fromMe,
            status: 'processing',
            text: null,
            error: null
        };

        this.recentTranscriptions.unshift(item);
        if (this.recentTranscriptions.length > 50) this.recentTranscriptions.pop();
        this.emit('transcription_update', item);

        this.addLog('info', `🎙️ Processando áudio de ${sender} (${isGroup ? 'Grupo' : 'Privado'})...`);

        try {
            // Reação de processamento (ampulheta)
            try {
                await this.sock.sendMessage(targetJid, { react: { text: '⏳', key: reactionKey } });
            } catch {}

            const buffer = await downloadMediaMessage(rawMsgToDownload, 'buffer', {});
            const texto = await this.transcreverAudio(buffer);

            if (texto && texto.length > 0) {
                await this.sock.sendMessage(targetJid, {
                    text: `🎙️ *Transcrição:* \n\n${texto}`
                }, { quoted: quoteMsgToReply });

                // Reação de sucesso (check)
                try {
                    await this.sock.sendMessage(targetJid, { react: { text: '✅', key: reactionKey } });
                } catch {}

                item.status = 'success';
                item.text = texto;
                this.stats.totalTranscribed++;

                this.addLog('info', `✅ Transcrição concluída: "${texto.substring(0, 60)}${texto.length > 60 ? '...' : ''}"`);
            } else {
                try {
                    await this.sock.sendMessage(targetJid, { react: { text: '❓', key: reactionKey } });
                } catch {}
                item.status = 'empty';
                item.text = '(Nenhuma fala audível detectada)';
            }
        } catch (err) {
            this.stats.totalErrors++;
            item.status = 'error';
            item.error = err.message;

            try {
                await this.sock.sendMessage(targetJid, { react: { text: '❌', key: reactionKey } });
            } catch {}

            this.addLog('error', `❌ Falha ao transcrever áudio: ${err.message}`);
        }

        this.emit('transcription_update', item);
        this.emit('status_change', this.getStatus());
    }

    async stop() {
        this.intentionallyStopped = true;
        this.addLog('info', 'Desligando transcritor do WhatsApp...');

        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners('connection.update');
                this.sock.ev.removeAllListeners('messages.upsert');
                this.sock.end(undefined);
            } catch (err) {
                this.addLog('warn', `Erro ao fechar socket: ${err.message}`);
            }
            this.sock = null;
        }

        this.setStatus('STOPPED', { qrCodeDataUrl: null });
        this.addLog('info', 'Transcritor desligado.');
    }

    async logout() {
        this.addLog('warn', 'Desconectando sessão do WhatsApp e removendo credenciais salvas...');
        await this.stop();
        this.cleanAuthInfo();
        this.connectedUser = null;
        this.setStatus('STOPPED', { qrCodeDataUrl: null, connectedUser: null });
        this.addLog('info', 'Sessão desvinculada com sucesso. Pronto para ler um novo QR Code.');
    }

    cleanAuthInfo() {
        const authDir = path.resolve('./auth_info');
        if (fs.existsSync(authDir)) {
            try {
                fs.rmSync(authDir, { recursive: true, force: true });
                fs.mkdirSync(authDir, { recursive: true });
            } catch (err) {
                this.addLog('error', `Erro ao limpar auth_info: ${err.message}`);
            }
        }
    }
}
