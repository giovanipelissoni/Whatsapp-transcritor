import EventEmitter from 'events';
import 'dotenv/config';
import makeWASocket, {
    useMultiFileAuthState,
    downloadMediaMessage,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import Groq, { toFile } from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { MarketManager } from './marketManager.js';

export class BotManager extends EventEmitter {
    constructor() {
        super();
        this.status = 'STOPPED'; // 'STOPPED' | 'STARTING' | 'WAITING_QR' | 'CONNECTED' | 'ERROR'
        this.qrCodeDataUrl = null;
        this.rawQr = null;
        this.pairingCode = null;
        this.connectedUser = null;
        this.sock = null;
        this.isTranscribingEnabled = true;
        this.intentionallyStopped = false;
        this.reconnectAttempts = 0;

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

        // Histórico de IDs processados para evitar re-transcrições pós-reconexão
        this.processedFile = path.resolve('./processed_ids.json');
        this.processedMessageIds = new Set();
        this.saveTimer = null;
        this.loadProcessedIds();

        // Gerenciador da Lista de Mercado
        this.market = new MarketManager();

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
        if (extra.pairingCode !== undefined) this.pairingCode = extra.pairingCode;
        if (extra.connectedUser !== undefined) this.connectedUser = extra.connectedUser;
        this.emit('status_change', this.getStatus());
    }

    getStatus() {
        return {
            status: this.status,
            qrCodeDataUrl: this.qrCodeDataUrl,
            pairingCode: this.pairingCode,
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

    loadProcessedIds() {
        try {
            if (fs.existsSync(this.processedFile)) {
                const data = JSON.parse(fs.readFileSync(this.processedFile, 'utf8'));
                if (Array.isArray(data)) {
                    this.processedMessageIds = new Set(data.slice(-2000));
                }
            }
        } catch {
            this.processedMessageIds = new Set();
        }
    }

    markMessageProcessed(id) {
        if (!id) return;
        this.processedMessageIds.add(id);
        if (this.processedMessageIds.size > 2000) {
            const first = this.processedMessageIds.values().next().value;
            this.processedMessageIds.delete(first);
        }
        if (!this.saveTimer) {
            this.saveTimer = setTimeout(() => {
                this.saveTimer = null;
                try {
                    fs.writeFileSync(this.processedFile, JSON.stringify(Array.from(this.processedMessageIds)));
                } catch {}
            }, 1500);
        }
    }

    isMessageProcessed(id) {
        return Boolean(id && this.processedMessageIds.has(id));
    }

    getMessageTimestampSeconds(rawMsg) {
        if (!rawMsg || !rawMsg.messageTimestamp) return Math.floor(Date.now() / 1000);
        if (typeof rawMsg.messageTimestamp === 'object' && typeof rawMsg.messageTimestamp.toNumber === 'function') {
            return rawMsg.messageTimestamp.toNumber();
        }
        return Number(rawMsg.messageTimestamp) || Math.floor(Date.now() / 1000);
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
        if (this.status === 'CONNECTED') {
            this.addLog('info', 'Bot já está conectado.');
            return;
        }

        this.intentionallyStopped = false;
        this.reconnectAttempts = 0;
        this.setStatus('STARTING', { qrCodeDataUrl: null, pairingCode: null });
        this.addLog('info', 'Iniciando conexão do WhatsApp...');

        await this._initSocket();
    }

    async _initSocket() {
        if (this.intentionallyStopped) return;

        // Limpa socket e eventos anteriores antes de reconectar
        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners('connection.update');
                this.sock.ev.removeAllListeners('creds.update');
                this.sock.ev.removeAllListeners('messages.upsert');
                this.sock.end(undefined);
            } catch {}
            this.sock = null;
        }

        try {
            const authDir = path.resolve('./auth_info');
            if (!fs.existsSync(authDir)) {
                fs.mkdirSync(authDir, { recursive: true });
            }

            // Valida integridade do creds.json se existir
            const credsPath = path.join(authDir, 'creds.json');
            if (fs.existsSync(credsPath)) {
                try {
                    const content = fs.readFileSync(credsPath, 'utf8');
                    JSON.parse(content);
                } catch {
                    this.addLog('warn', 'Arquivo creds.json corrompido. Reiniciando credenciais...');
                    this.cleanAuthInfo();
                }
            }

            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            let version = [2, 3000, 1015901307];
            try {
                const fetched = await fetchLatestBaileysVersion();
                if (fetched && fetched.version) version = fetched.version;
            } catch {
                // fallback para versão segura
            }

            this.sock = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: Browsers.ubuntu('Chrome'), // Navegador oficial mais estável para Baileys
                syncFullHistory: false, // Não baixa histórico antigo (evita timeout no celular)
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                getMessage: async () => ({ conversation: '' })
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
                        this.setStatus('WAITING_QR', { qrCodeDataUrl: qrDataUrl, pairingCode: null });
                        this.addLog('info', 'QR Code pronto. Aponte a câmera do WhatsApp para conectar.');
                    } catch (e) {
                        this.addLog('error', `Falha ao gerar QR Code Data URL: ${e.message}`);
                    }
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error instanceof Boom)
                        ? lastDisconnect.error.output?.statusCode
                        : null;
                    const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                    const isRestartRequired = statusCode === DisconnectReason.restartRequired; // 515

                    this.addLog('warn', `Conexão fechada. Motivo / Código: ${statusCode || 'desconhecido'}`);

                    if (this.intentionallyStopped) {
                        this.setStatus('STOPPED', { qrCodeDataUrl: null, pairingCode: null, connectedUser: null });
                        this.addLog('info', 'Bot foi desligado manualmente pelo usuário.');
                        return;
                    }

                    if (isLoggedOut) {
                        this.setStatus('STOPPED', { qrCodeDataUrl: null, pairingCode: null, connectedUser: null });
                        this.addLog('error', 'Sessão desvinculada. Limpando credenciais para novo pareamento.');
                        this.cleanAuthInfo();
                        return;
                    }

                    // Se for código 515 (restartRequired), acontece logo após a leitura do QR Code!
                    // Deve reconectar imediatamente para finalizar a sincronização das chaves.
                    if (isRestartRequired) {
                        this.addLog('info', '🔄 QR Code reconhecido! Finalizando pareamento com o WhatsApp...');
                        this.setStatus('STARTING');
                        setTimeout(() => {
                            if (!this.intentionallyStopped) this._initSocket();
                        }, 500);
                        return;
                    }

                    // Para outras quedas temporárias de rede
                    this.reconnectAttempts++;
                    const delay = Math.min(2000 * this.reconnectAttempts, 10000);
                    this.setStatus('STARTING');
                    this.addLog('info', `Reconectando ao WhatsApp em ${delay / 1000}s...`);

                    setTimeout(() => {
                        if (!this.intentionallyStopped) this._initSocket();
                    }, delay);

                } else if (connection === 'open') {
                    this.reconnectAttempts = 0;
                    const user = this.sock.user || {};
                    const phone = user.id ? user.id.split(':')[0] : '';
                    const connectedUser = {
                        id: user.id,
                        name: user.name || 'Usuário WhatsApp',
                        phone: phone
                    };

                    this.setStatus('CONNECTED', { qrCodeDataUrl: null, pairingCode: null, connectedUser });
                    this.stats.startedAt = new Date().toISOString();
                    this.addLog('info', `✅ WhatsApp Conectado com sucesso! Aparelho: ${connectedUser.name} (+${connectedUser.phone})`);
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

    async requestPairingCode(phoneNumber) {
        const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
        if (!cleanPhone || cleanPhone.length < 10) {
            throw new Error('Informe o número completo com DDI e DDD (ex: 5511999998888).');
        }

        if (!this.sock) {
            await this.start();
        }

        // Aguarda o socket estabelecer a conexão com os servidores do WhatsApp
        let waited = 0;
        while (!this.sock?.ws?.isOpen && !this.rawQr && waited < 4000) {
            await new Promise((r) => setTimeout(r, 200));
            waited += 200;
        }

        try {
            this.addLog('info', `Solicitando código de pareamento para +${cleanPhone}...`);
            const code = await this.sock.requestPairingCode(cleanPhone);
            const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
            this.pairingCode = formatted;
            this.setStatus('WAITING_QR', { pairingCode: formatted });
            this.addLog('info', `Código de pareamento gerado: ${formatted}`);
            return formatted;
        } catch (err) {
            this.addLog('error', `Falha ao gerar código de pareamento: ${err.message}`);
            throw new Error(`Falha no WhatsApp: ${err.message}`);
        }
    }

    async handleMessage(rawMsg) {
        if (!rawMsg.message) return;

        const remoteJid = rawMsg.key.remoteJid;
        if (!remoteJid || remoteJid === 'status@broadcast') return;

        const msgId = rawMsg.key.id;
        if (!msgId) return;

        const isGroup = remoteJid.endsWith('@g.us');
        const fromMe = Boolean(rawMsg.key.fromMe);
        const message = this.getNormalizedMessage(rawMsg.message);
        if (!message) return;

        const audioMsg = message.audioMessage;
        const textMsg = (message.conversation || message.extendedTextMessage?.text || '').trim();
        const contextInfo = message.extendedTextMessage?.contextInfo;
        const quotedMessage = this.getNormalizedMessage(contextInfo?.quotedMessage);

        const lowerText = textMsg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        // =========================================================================
        // SEGURANÇA: Comandos só podem ser executados pelo próprio usuário (fromMe === true)
        // Comandos enviados por terceiros são ignorados para proteger a lista e privacidade
        // =========================================================================
        const isBotCommand = lowerText.startsWith('/mercado') ||
                             lowerText.startsWith('/comandos') ||
                             lowerText.startsWith('/ajuda') ||
                             lowerText.startsWith('/transcrever');

        if (isBotCommand && !fromMe) {
            return; // Ignora silenciosamente comandos de terceiros
        }

        // =========================================================================
        // COMANDO: /comandos (ou /ajuda)
        // =========================================================================
        if (lowerText === '/comandos' || lowerText.startsWith('/comandos ') || lowerText === '/ajuda') {
            if (this.isMessageProcessed(msgId)) return;
            const nowSec = Math.floor(Date.now() / 1000);
            if (nowSec - this.getMessageTimestampSeconds(rawMsg) > 180) return;
            this.markMessageProcessed(msgId);

            const helpText = `🤖 *Comandos do Assistente Pessoal:*

🎙️ *Áudio & Transcrição:*
• */transcrever*: Responda citando qualquer áudio recebido ou enviado para transcrevê-lo sob demanda.

🛒 *Lista de Mercado por Categorias:*
• */mercado*: Exibe a lista completa organizada por seções (Hortifrúti, Carnes, Laticínios, Limpeza...).
• */mercado [seção]*: Filtra apenas uma seção (ex: */mercado hortifruti*, */mercado limpeza*).
• */mercado marcar [número]*: Marca ou desmarca um item como comprado no supermercado.
• */mercado adicionar [item]*: Adiciona produtos com categorização automática inteligente.
• */mercado remover [número ou nome]*: Remove um produto da lista.
• */mercado sugestão*: A IA analisa sua lista e sugere itens complementares que possam faltar.
• */mercado adicionar sugestão*: Adiciona os itens sugeridos pela IA à sua lista de compras.
• */mercado limpar*: Esvazia toda a lista de compras.`;

            await this.sock.sendMessage(remoteJid, { text: helpText }, { quoted: rawMsg });
            return;
        }

        // =========================================================================
        // COMANDOS: /mercado
        // =========================================================================
        if (lowerText === '/mercado' || lowerText.startsWith('/mercado ')) {
            if (this.isMessageProcessed(msgId)) return;
            const nowSec = Math.floor(Date.now() / 1000);
            if (nowSec - this.getMessageTimestampSeconds(rawMsg) > 180) return;
            this.markMessageProcessed(msgId);

            // Subcomando 1: /mercado adicionar sugestao
            if (lowerText.startsWith('/mercado adicionar sugestao')) {
                const added = this.market.applyLastSuggestions();
                if (added.length === 0) {
                    await this.sock.sendMessage(remoteJid, {
                        text: `⚠️ *Nenhuma sugestão pendente encontrada!*\n\nEnvie primeiro */mercado sugestão* para a IA gerar novas ideias.`
                    }, { quoted: rawMsg });
                    return;
                }

                this.emit('market_updated', this.market.getItems());
                await this.sock.sendMessage(remoteJid, {
                    text: `✅ *${added.length} sugestões adicionadas à sua lista:*\n\n${added.map(i => `• ${i.name} _(${i.category})_`).join('\n')}\n\nEnvie */mercado* para ver a lista atualizada.`
                }, { quoted: rawMsg });
                return;
            }

            // Subcomando 2: /mercado adicionar [itens...]
            if (lowerText.startsWith('/mercado adicionar')) {
                const itemsText = textMsg.replace(/^\/mercado\s+adicionar\s*/i, '').trim();
                if (!itemsText) {
                    await this.sock.sendMessage(remoteJid, {
                        text: `💡 *Como adicionar:* Digite o produto após o comando.\nExemplo: */mercado adicionar Arroz, Café, Ovos, Banana*`
                    }, { quoted: rawMsg });
                    return;
                }

                const added = this.market.addItem(itemsText);
                this.emit('market_updated', this.market.getItems());
                await this.sock.sendMessage(remoteJid, {
                    text: `✅ *Produto${added.length > 1 ? 's' : ''} adicionado${added.length > 1 ? 's' : ''} à lista:*\n${added.map(i => `• ${i.name} _(${i.category})_`).join('\n')}\n\nEnvie */mercado* para visualizar sua lista por categorias.`
                }, { quoted: rawMsg });
                return;
            }

            // Subcomando 3: /mercado marcar ou /mercado check [número ou nome]
            if (lowerText.startsWith('/mercado marcar') || lowerText.startsWith('/mercado check')) {
                const target = textMsg.replace(/^\/mercado\s+(marcar|check)\s*/i, '').trim();
                if (!target) {
                    await this.sock.sendMessage(remoteJid, {
                        text: `💡 *Como marcar:* Informe o número ou nome do item.\nExemplo: */mercado marcar 2* ou */mercado marcar Banana*`
                    }, { quoted: rawMsg });
                    return;
                }

                const toggled = this.market.toggleItem(target);
                if (toggled) {
                    this.emit('market_updated', this.market.getItems());
                    const statusText = toggled.checked
                        ? `✅ Item comprado: *~${toggled.name}~* _(${toggled.category})_`
                        : `◻️ Item desmarcado: *${toggled.name}* _(${toggled.category})_`;
                    await this.sock.sendMessage(remoteJid, {
                        text: `${statusText}\n\nEnvie */mercado* para conferir a lista atualizada.`
                    }, { quoted: rawMsg });
                } else {
                    await this.sock.sendMessage(remoteJid, {
                        text: `❌ Item "*${target}*" não encontrado na lista.\nEnvie */mercado* para ver os números dos itens.`
                    }, { quoted: rawMsg });
                }
                return;
            }

            // Subcomando 4: /mercado remover [item/número]
            if (lowerText.startsWith('/mercado remover')) {
                const target = textMsg.replace(/^\/mercado\s+remover\s*/i, '').trim();
                if (!target) {
                    await this.sock.sendMessage(remoteJid, {
                        text: `💡 *Como remover:* Informe o número ou nome do item.\nExemplo: */mercado remover 2* ou */mercado remover Leite*`
                    }, { quoted: rawMsg });
                    return;
                }

                const removed = this.market.removeItem(target);
                if (removed) {
                    this.emit('market_updated', this.market.getItems());
                    await this.sock.sendMessage(remoteJid, {
                        text: `🗑️ Item removido da lista: *${removed.name}* _(${removed.category})_`
                    }, { quoted: rawMsg });
                } else {
                    await this.sock.sendMessage(remoteJid, {
                        text: `❌ Item "*${target}*" não encontrado na lista.\nEnvie */mercado* para ver os números dos itens.`
                    }, { quoted: rawMsg });
                }
                return;
            }

            // Subcomando 5: /mercado limpar
            if (lowerText === '/mercado limpar') {
                const count = this.market.clearList();
                this.emit('market_updated', this.market.getItems());
                await this.sock.sendMessage(remoteJid, {
                    text: `🗑️ *Lista de mercado esvaziada com sucesso!* (${count} item${count === 1 ? '' : 's'} removido${count === 1 ? '' : 's'})`
                }, { quoted: rawMsg });
                return;
            }

            // Subcomando 6: /mercado sugestao
            if (lowerText === '/mercado sugestao') {
                try {
                    await this.sock.sendMessage(remoteJid, { react: { text: '✨', key: rawMsg.key } });
                } catch {}

                try {
                    const suggestions = await this.market.generateSuggestions(this.groq);
                    if (suggestions.length === 0) {
                        await this.sock.sendMessage(remoteJid, {
                            text: `Não consegui gerar sugestões no momento. Tente novamente mais tarde.`
                        }, { quoted: rawMsg });
                        return;
                    }

                    const formattedList = suggestions.map((s, idx) => `*${idx + 1}.* ${s}`).join('\n');
                    const reply = `✨ *Sugestões Inteligentes de Mercado (IA):*\n\n${formattedList}\n\n👉 Para incluir essas sugestões na sua lista de compras, envie:\n*/mercado adicionar sugestão*`;

                    await this.sock.sendMessage(remoteJid, { text: reply }, { quoted: rawMsg });
                    try {
                        await this.sock.sendMessage(remoteJid, { react: { text: '✅', key: rawMsg.key } });
                    } catch {}
                } catch (err) {
                    await this.sock.sendMessage(remoteJid, {
                        text: `❌ Erro ao gerar sugestões com IA: ${err.message}`
                    }, { quoted: rawMsg });
                }
                return;
            }

            // Subcomando padrão: /mercado ou /mercado [categoria]
            const categoryFilter = textMsg.replace(/^\/mercado\s*/i, '').trim();
            const listMsg = this.market.formatWhatsAppList(categoryFilter || null);
            await this.sock.sendMessage(remoteJid, { text: listMsg }, { quoted: rawMsg });
            return;
        }

        // Se transcrições estiverem pausadas globalmente, ignora processamento de áudio
        if (!this.isTranscribingEnabled) {
            return;
        }

        const isTranscribeCommand = textMsg.toLowerCase().startsWith('/transcrever');

        // =========================================================================
        // REGRA 1: COMANDO /transcrever (TODAS as conversas: Privado e Grupos)
        // =========================================================================
        if (isTranscribeCommand && quotedMessage?.audioMessage) {
            // Se o comando já foi executado, ignora
            if (this.isMessageProcessed(msgId)) {
                return;
            }

            // Ignora se o comando for uma mensagem antiga sincronizada após reconexão
            const nowSec = Math.floor(Date.now() / 1000);
            const cmdSec = this.getMessageTimestampSeconds(rawMsg);
            if (nowSec - cmdSec > 180) {
                return;
            }

            // Se for grupo e estiver totalmente desativado para grupos, ignora
            if (isGroup && this.config.groupMode === 'disabled') {
                return;
            }

            this.markMessageProcessed(msgId);
            if (contextInfo?.stanzaId) {
                this.markMessageProcessed(contextInfo.stanzaId);
            }

            const quotedMsgObj = {
                key: {
                    remoteJid: remoteJid,
                    id: contextInfo.stanzaId,
                    ...(contextInfo.participant ? { participant: contextInfo.participant } : {})
                },
                message: quotedMessage
            };

            const sender = isGroup
                ? (contextInfo.participant || remoteJid)
                : remoteJid.replace('@s.whatsapp.net', '');

            await this.processAudioMessage({
                targetJid: remoteJid,
                rawMsgToDownload: quotedMsgObj,
                quoteMsgToReply: rawMsg,
                reactionKey: rawMsg.key,
                fromMe,
                isGroup,
                sender,
                isReplyToCommand: true
            });
            return;
        }

        // =========================================================================
        // VALIDAÇÃO PARA TRANSCRIÇÃO AUTOMÁTICA (Áudios ao vivo)
        // =========================================================================
        if (audioMsg) {
            // 1. Evita reprocessar áudios já transcritos
            if (this.isMessageProcessed(msgId)) {
                return;
            }

            // 2. Filtro anti-histórico / pós-reconexão:
            // Só transcreve áudios novos enviados nos últimos 180 segundos (3 minutos).
            // Áudios mais antigos que isso são mensagens passadas sincronizadas pelo WhatsApp.
            const nowSeconds = Math.floor(Date.now() / 1000);
            const msgSeconds = this.getMessageTimestampSeconds(rawMsg);
            const ageSeconds = nowSeconds - msgSeconds;

            if (ageSeconds > 180) {
                // Áudio histórico sincronizado na reconexão -> Ignora silenciosamente
                return;
            }

            // =====================================================================
            // REGRA 2: PRIVADO (DMs) - Transcrição automática de áudios novos
            // =====================================================================
            if (!isGroup && this.config.transcribePrivateAudio) {
                if (fromMe && !this.config.transcribeMyOwnAudio) {
                    return; // Usuário desativou transcrição dos próprios áudios
                }

                this.markMessageProcessed(msgId);

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

            // =====================================================================
            // REGRA 3: GRUPOS - Transcrever sempre (se configurado como 'always')
            // =====================================================================
            if (isGroup && this.config.groupMode === 'always') {
                this.markMessageProcessed(msgId);

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
                this.sock.ev.removeAllListeners('creds.update');
                this.sock.ev.removeAllListeners('messages.upsert');
                this.sock.end(undefined);
            } catch (err) {
                this.addLog('warn', `Erro ao fechar socket: ${err.message}`);
            }
            this.sock = null;
        }

        this.setStatus('STOPPED', { qrCodeDataUrl: null, pairingCode: null });
        this.addLog('info', 'Transcritor desligado.');
    }

    async logout() {
        this.addLog('warn', 'Desconectando sessão do WhatsApp e removendo credenciais salvas...');
        await this.stop();
        this.cleanAuthInfo();
        this.connectedUser = null;
        this.setStatus('STOPPED', { qrCodeDataUrl: null, pairingCode: null, connectedUser: null });
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
