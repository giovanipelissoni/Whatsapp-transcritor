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

        // Whitelist de números autorizados a executar comandos do assistente
        this.whitelistFile = path.resolve('./whitelist.json');
        this.whitelist = [];
        this.lidMap = new Map(); // Mapeamento bidirecional LID <-> Telefone
        this.loadWhitelist();

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
            hasGroqKey: Boolean(this.groq),
            whitelist: this.whitelist
        };
    }

    loadWhitelist() {
        try {
            if (fs.existsSync(this.whitelistFile)) {
                const data = JSON.parse(fs.readFileSync(this.whitelistFile, 'utf8'));
                if (Array.isArray(data)) {
                    this.whitelist = data;
                    return;
                }
            }
            this.whitelist = [
                {
                    phone: '5511943495006',
                    name: 'Esposa',
                    createdAt: new Date().toISOString()
                }
            ];
            this.saveWhitelist();
        } catch {
            this.whitelist = [];
        }
    }

    saveWhitelist() {
        try {
            fs.writeFileSync(this.whitelistFile, JSON.stringify(this.whitelist, null, 2), 'utf8');
        } catch (err) {
            this.addLog('error', `Erro ao salvar whitelist.json: ${err.message}`);
        }
    }

    getWhitelist() {
        return this.whitelist;
    }

    async addAllowedNumber(phone, name = '', customLid = null) {
        const raw = (phone || '').trim();
        const clean = raw.replace(/\D/g, '');
        if (!clean || clean.length < 8) {
            throw new Error('Informe um número de telefone válido com DDD ou LID (mínimo 8 dígitos).');
        }

        let resolvedLid = customLid ? customLid.trim() : null;

        // Se o usuário passou um LID diretamente (ex: 164064042983460@lid ou 15 dígitos sem 55)
        if (!resolvedLid && (raw.includes('@lid') || (clean.length >= 14 && clean.length <= 16 && !clean.startsWith('55')))) {
            resolvedLid = clean.includes('@lid') ? clean : `${clean}@lid`;
        }

        // Se já conhecemos o LID no mapa em memória (via contatos sincronizados ou mensagens)
        if (!resolvedLid && this.lidMap && this.lidMap.has(clean)) {
            resolvedLid = `${this.lidMap.get(clean)}@lid`;
        }

        // Se o socket estiver conectado e não for LID direto, tenta resolver no WhatsApp
        if (!resolvedLid && this.sock && typeof this.sock.onWhatsApp === 'function') {
            try {
                const queries = [];
                let intlNumber = clean;
                if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) {
                    intlNumber = `55${clean}`;
                }
                if (intlNumber.startsWith('55')) {
                    queries.push(intlNumber);
                    // Variação sem 9º dígito (12 dígitos) se tiver 13
                    if (intlNumber.length === 13 && intlNumber[4] === '9') {
                        queries.push(`${intlNumber.slice(0, 4)}${intlNumber.slice(5)}`);
                    } else if (intlNumber.length === 12) {
                        queries.push(`${intlNumber.slice(0, 4)}9${intlNumber.slice(4)}`);
                    }
                } else {
                    queries.push(intlNumber);
                }

                for (const q of queries) {
                    const results = await this.sock.onWhatsApp(q);
                    if (Array.isArray(results) && results.length > 0) {
                        const match = results.find(r => r.exists && r.lid);
                        if (match && match.lid) {
                            resolvedLid = match.lid;
                            break;
                        }
                    }
                }
            } catch {}
        }

        const existing = this.whitelist.find(item => item.phone === clean || (resolvedLid && item.lid === resolvedLid));
        if (existing) {
            existing.phone = clean;
            existing.name = name ? name.trim() : existing.name;
            if (resolvedLid) existing.lid = resolvedLid;
        } else {
            this.whitelist.push({
                phone: clean,
                name: name ? name.trim() : 'Autorizado',
                lid: resolvedLid || null,
                createdAt: new Date().toISOString()
            });
        }

        this.saveWhitelist();
        this.emit('whitelist_updated', this.whitelist);
        this.emit('status_change', this.getStatus());
        this.addLog('info', `Número adicionado à whitelist de comandos: +${clean} (${name || 'Autorizado'})${resolvedLid ? ' [LID: ' + resolvedLid + ']' : ''}`);
        return this.whitelist;
    }

    removeAllowedNumber(phone) {
        const clean = (phone || '').replace(/\D/g, '');
        const prevLength = this.whitelist.length;
        this.whitelist = this.whitelist.filter(item => item.phone !== clean && (!item.lid || !item.lid.includes(clean)));

        if (this.whitelist.length !== prevLength) {
            this.saveWhitelist();
            this.emit('whitelist_updated', this.whitelist);
            this.emit('status_change', this.getStatus());
            this.addLog('info', `Número removido da whitelist de comandos: +${clean}`);
        }
        return this.whitelist;
    }

    async resolveLidsForWhitelist() {
        if (!this.sock || typeof this.sock.onWhatsApp !== 'function') return;

        let changed = false;
        for (const entry of this.whitelist) {
            if (!entry.lid && entry.phone) {
                try {
                    const clean = entry.phone.replace(/\D/g, '');
                    const queries = [];
                    let intlNumber = clean;
                    if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) {
                        intlNumber = `55${clean}`;
                    }
                    if (intlNumber.startsWith('55')) {
                        queries.push(intlNumber);
                        if (intlNumber.length === 13 && intlNumber[4] === '9') {
                            queries.push(`${intlNumber.slice(0, 4)}${intlNumber.slice(5)}`);
                        } else if (intlNumber.length === 12) {
                            queries.push(`${intlNumber.slice(0, 4)}9${intlNumber.slice(4)}`);
                        }
                    } else {
                        queries.push(intlNumber);
                    }

                    for (const q of queries) {
                        const results = await this.sock.onWhatsApp(q);
                        if (Array.isArray(results) && results.length > 0) {
                            const match = results.find(r => r.exists && r.lid);
                            if (match && match.lid) {
                                entry.lid = match.lid;
                                changed = true;
                                this.addLog('info', `✅ LID resolvido para ${entry.name} (+${entry.phone}): ${entry.lid}`);
                                break;
                            }
                        }
                    }
                } catch (e) {
                    // Silently ignore
                }
            }
        }

        if (changed) {
            this.saveWhitelist();
            this.emit('whitelist_updated', this.whitelist);
        }
    }

    isSenderAuthorized(rawMsg) {
        if (!rawMsg) return false;
        if (rawMsg.key?.fromMe) return true;

        const jids = [
            rawMsg.key?.participant,
            rawMsg.key?.remoteJid,
            rawMsg.participant
        ].filter(Boolean);

        for (const jid of jids) {
            const senderPart = jid.split('@')[0].split(':')[0];
            const senderDigits = senderPart.replace(/\D/g, '');
            const isLid = jid.endsWith('@lid');

            // Busca mapeamento em memória se disponível
            const mappedPhone = isLid && this.lidMap ? this.lidMap.get(senderDigits) : null;
            const mappedLid = !isLid && this.lidMap ? this.lidMap.get(senderDigits) : null;

            for (const entry of this.whitelist) {
                const targetDigits = (entry.phone || '').replace(/\D/g, '');
                const targetLid = (entry.lid || '').replace(/\D/g, '');

                // 1. Verificação direta de LID
                if (targetLid) {
                    if (senderDigits === targetLid || jid.includes(targetLid)) {
                        return true;
                    }
                    if (mappedLid && (mappedLid === targetLid || mappedLid === senderDigits)) {
                        return true;
                    }
                }

                // 2. Verificação via mapeamento automático LID -> Telefone
                if (mappedPhone && targetDigits) {
                    if (mappedPhone === targetDigits || mappedPhone.endsWith(targetDigits) || targetDigits.endsWith(mappedPhone)) {
                        return true;
                    }
                    if (mappedPhone.length >= 10 && targetDigits.length >= 10) {
                        if (mappedPhone.slice(-8) === targetDigits.slice(-8)) {
                            return true;
                        }
                    }
                }

                // 3. Se o identificador cadastrado for exatamente o senderDigits
                if (senderDigits === targetDigits) return true;

                // 4. Correspondência com ou sem DDI (55)
                if (!isLid && targetDigits) {
                    if (senderDigits.endsWith(targetDigits) || targetDigits.endsWith(senderDigits)) {
                        const minLen = Math.min(senderDigits.length, targetDigits.length);
                        if (minLen >= 8) return true;
                    }

                    // 5. Variação do 9º dígito celular no Brasil (compara os últimos 8 dígitos)
                    if (senderDigits.length >= 10 && targetDigits.length >= 10) {
                        const last8Sender = senderDigits.slice(-8);
                        const last8Target = targetDigits.slice(-8);
                        if (last8Sender === last8Target) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    async sendMarketPoll(targetJid, categoryFilter = null, quotedMsg = null) {
        if (!this.sock) throw new Error('WhatsApp não está conectado.');

        const items = this.market.getItems();
        if (items.length === 0) {
            await this.sock.sendMessage(targetJid, {
                text: '🛒 *Sua lista de mercado está vazia!*\n\nAdicione itens antes de gerar a enquete checklist.'
            }, { quoted: quotedMsg });
            return;
        }

        // Se houver filtro por seção/categoria (ex: hortifruti)
        if (categoryFilter) {
            const normFilter = this.market.normalizeStr(categoryFilter);
            const groups = this.market.getItemsGrouped();
            const matchedGroup = groups.find(g => this.market.normalizeStr(g.category).includes(normFilter));

            if (!matchedGroup) {
                const available = groups.map(g => `${g.icon} ${g.category}`).join('\n• ');
                await this.sock.sendMessage(targetJid, {
                    text: `❌ Seção "*${categoryFilter}*" não encontrada.\n\nSeções com produtos:\n• ${available}`
                }, { quoted: quotedMsg });
                return;
            }

            // WhatsApp limita a no máximo 12 opções por enquete
            const chunks = [];
            for (let i = 0; i < matchedGroup.items.length; i += 12) {
                chunks.push(matchedGroup.items.slice(i, i + 12));
            }

            for (let idx = 0; idx < chunks.length; idx++) {
                const chunk = chunks[idx];
                const partSuffix = chunks.length > 1 ? ` (Parte ${idx + 1}/${chunks.length})` : '';
                await this.sock.sendMessage(targetJid, {
                    poll: {
                        name: `${matchedGroup.icon} ${matchedGroup.category}${partSuffix}`,
                        values: chunk.map(i => i.name),
                        selectableCount: 0 // 0 = Seleção múltipla / Checklist interativo!
                    }
                }, { quoted: idx === 0 ? quotedMsg : undefined });
                await new Promise(r => setTimeout(r, 300));
            }
            return;
        }

        // Caso A: Total de itens <= 12 -> Envia 1 enquete direta com tudo!
        if (items.length <= 12) {
            await this.sock.sendMessage(targetJid, {
                poll: {
                    name: `🛒 Lista de Compras (${items.length} itens)`,
                    values: items.map(i => i.name),
                    selectableCount: 0 // 0 = Seleção múltipla / Checklist interativo!
                }
            }, { quoted: quotedMsg });
            return;
        }

        // Caso B: Total > 12 itens -> Envia enquetes organizadas por seção do supermercado!
        const groups = this.market.getItemsGrouped();
        await this.sock.sendMessage(targetJid, {
            text: `🛒 *Lista de Compras em Enquete (Checklist):*\n\nSeparadas por seções para facilitar suas compras. Basta tocar nas opções para marcar como comprado! 👇`
        }, { quoted: quotedMsg });

        for (const group of groups) {
            const chunks = [];
            for (let i = 0; i < group.items.length; i += 12) {
                chunks.push(group.items.slice(i, i + 12));
            }

            for (let idx = 0; idx < chunks.length; idx++) {
                const chunk = chunks[idx];
                const partSuffix = chunks.length > 1 ? ` (Parte ${idx + 1}/${chunks.length})` : '';
                await this.sock.sendMessage(targetJid, {
                    poll: {
                        name: `${group.icon} ${group.category}${partSuffix}`,
                        values: chunk.map(i => i.name),
                        selectableCount: 0
                    }
                });
                await new Promise(r => setTimeout(r, 350));
            }
        }
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

    async generateImage(prompt) {
        const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

        // 1. Tenta usar o Google AI Studio (Imagen 3 / Nano Banana) se GEMINI_API_KEY estiver configurada
        if (geminiKey && geminiKey !== 'SUA_CHAVE_GEMINI_AQUI') {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${geminiKey}`;
                const payload = {
                    instances: [{ prompt }],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: '1:1',
                        outputMimeType: 'image/jpeg'
                    }
                };

                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
                        const buffer = Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
                        return {
                            buffer,
                            engine: 'Google Imagen 3 (Nano Banana)',
                            note: ''
                        };
                    }
                } else {
                    const errorText = await res.text();
                    this.addLog('warn', `Google Imagen 3 retornou status ${res.status}: ${errorText.substring(0, 120)}`);
                }
            } catch (err) {
                this.addLog('warn', `Erro ao chamar Google Imagen 3: ${err.message}. Alternando para fallback...`);
            }
        }

        // 2. Fallback de alta resolução caso a chave ainda não tenha sido configurada
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
        const res = await fetch(pollinationsUrl);
        if (!res.ok) {
            throw new Error(`Falha no serviço de geração de imagem (HTTP ${res.status}).`);
        }

        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const engine = 'Nano Banana Flux';
        const note = geminiKey
            ? ''
            : '💡 _Dica: Você também pode adicionar `GEMINI_API_KEY` no seu `.env` para usar o motor oficial Imagen 3 do Google AI Studio._';

        return {
            buffer,
            engine,
            note
        };
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
                    this.resolveLidsForWhitelist().catch(() => {});
                }
            });

            // Mapeamento automático de contatos e LIDs
            this.sock.ev.on('contacts.upsert', (contacts) => {
                if (Array.isArray(contacts)) {
                    for (const c of contacts) {
                        if (c.id && c.lid) {
                            const phoneDigits = c.id.split('@')[0].replace(/\D/g, '');
                            const lidDigits = c.lid.split('@')[0].replace(/\D/g, '');
                            if (phoneDigits && lidDigits) {
                                this.lidMap.set(lidDigits, phoneDigits);
                                this.lidMap.set(phoneDigits, lidDigits);
                            }
                        }
                    }
                }
            });

            this.sock.ev.on('contacts.update', (contacts) => {
                if (Array.isArray(contacts)) {
                    for (const c of contacts) {
                        if (c.id && c.lid) {
                            const phoneDigits = c.id.split('@')[0].replace(/\D/g, '');
                            const lidDigits = c.lid.split('@')[0].replace(/\D/g, '');
                            if (phoneDigits && lidDigits) {
                                this.lidMap.set(lidDigits, phoneDigits);
                                this.lidMap.set(phoneDigits, lidDigits);
                            }
                        }
                    }
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
        // SEGURANÇA: Comandos só podem ser executados por você (fromMe === true)
        // ou por contatos autorizados na Whitelist do Dashboard (ex: Esposa)
        // Comandos enviados por terceiros não autorizados são ignorados
        // =========================================================================
        const senderJid = isGroup ? (rawMsg.key?.participant || remoteJid) : remoteJid;
        const senderPart = senderJid ? senderJid.split('@')[0].split(':')[0] : '';
        const contextType = isGroup ? '[Grupo]' : '[Privado]';
        const senderDisplay = fromMe
            ? `Você (${this.connectedUser?.name || 'Giovani'})`
            : (rawMsg.pushName ? `${rawMsg.pushName} [${senderPart}]` : senderPart);

        const isBotCommand = lowerText.startsWith('/mercado') ||
                             lowerText.startsWith('/nanobanana') ||
                             lowerText.startsWith('/imagem') ||
                             lowerText.startsWith('/comandos') ||
                             lowerText.startsWith('/ajuda') ||
                             lowerText.startsWith('/transcrever');

        if (isBotCommand) {
            const isAuthorized = fromMe || this.isSenderAuthorized(rawMsg);







            if (!isAuthorized) {
                this.addLog('warn', `⛔ ${contextType} Comando "${textMsg}" de ${senderDisplay} BLOQUEADO: remetente não autorizado na whitelist.`);
                return;
            }

            // Se for @lid autorizado, garante que o LID fique salvo no registro da whitelist
            if (senderJid.endsWith('@lid')) {
                const cleanLid = senderJid.split('@')[0].replace(/\D/g, '');
                for (const entry of this.whitelist) {
                    const targetLid = (entry.lid || '').replace(/\D/g, '');
                    if (targetLid === cleanLid && !entry.lid.includes('@lid')) {
                        entry.lid = senderJid;
                        this.saveWhitelist();
                        this.emit('whitelist_updated', this.whitelist);
                    }
                }
            }

            this.addLog('info', `📨 ${contextType} Comando "${textMsg}" de ${senderDisplay} AUTORIZADO! Processando resposta...`);
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

🎨 *Geração de Imagens por IA (Nano Banana):*
• */nanobanana [descrição]* ou */imagem [descrição]*: Gera uma imagem em alta resolução a partir do seu prompt.

🛒 *Lista de Mercado por Categorias:*
• */mercado*: Exibe a lista completa organizada por seções (Hortifrúti, Carnes, Laticínios, Limpeza...).
• */mercado enquete*: Transforma a lista em Enquete Interativa (Checklist nativo do WhatsApp)!
• */mercado enquete [seção]*: Envia enquete apenas de uma seção (ex: */mercado enquete hortifruti*).
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

            // Subcomando 7: /mercado enquete ou /mercado checklist ou /mercado poll
            if (lowerText.startsWith('/mercado enquete') || lowerText.startsWith('/mercado checklist') || lowerText.startsWith('/mercado poll')) {
                const subArg = textMsg.replace(/^\/mercado\s+(enquete|checklist|poll)\s*/i, '').trim();
                await this.sendMarketPoll(remoteJid, subArg || null, rawMsg);
                return;
            }

            // Subcomando padrão: /mercado ou /mercado [categoria]
            const categoryFilter = textMsg.replace(/^\/mercado\s*/i, '').trim();
            const listMsg = this.market.formatWhatsAppList(categoryFilter || null);
            await this.sock.sendMessage(remoteJid, { text: listMsg }, { quoted: rawMsg });
            return;
        }

        // =========================================================================
        // COMANDOS: /nanobanana ou /imagem (Geração de Imagens por IA)
        // =========================================================================
        if (
            lowerText === '/nanobanana' || lowerText.startsWith('/nanobanana ') ||
            lowerText === '/imagem' || lowerText.startsWith('/imagem ')
        ) {
            if (this.isMessageProcessed(msgId)) return;
            const nowSec = Math.floor(Date.now() / 1000);
            if (nowSec - this.getMessageTimestampSeconds(rawMsg) > 180) return;
            this.markMessageProcessed(msgId);

            let prompt = textMsg
                .replace(/^\/(nanobanana|imagem)\s*/i, '')
                .trim();

            // Limpa termos introdutórios comuns em linguagem natural
            prompt = prompt.replace(/^(gere|crie|faca|faça|desenhe)\s+(uma\s+)?(imagem|foto|desenho|ilustracao|ilustração)\s+(de\s+|do\s+|da\s+)?/i, '').trim();

            if (!prompt) {
                const helpImage = `🎨 *Como gerar imagens com IA (Nano Banana):*

Envie o comando seguido da descrição do que você quer ver.

*Exemplos de uso:*
• */nanobanana um tubarão realista nadando no oceano azul*
• */imagem um gato astronauta flutuando no espaço cyberpunk*
• */nanobanana pôr do sol em uma praia tropical em aquarela*

💡 _Dica: Quanto mais detalhes (cores, iluminação, ambiente, estilo), mais surpreendente será o resultado!_`;
                await this.sock.sendMessage(remoteJid, { text: helpImage }, { quoted: rawMsg });
                return;
            }

            try {
                // Reação de processamento visual
                try {
                    await this.sock.sendMessage(remoteJid, { react: { text: '🎨', key: rawMsg.key } });
                } catch {}

                this.addLog('info', `🎨 Gerando imagem IA para ${senderDisplay}: "${prompt}"...`);

                const { buffer, engine, note } = await this.generateImage(prompt);

                const caption = `🎨 *Arte Gerada por IA*\n🏛️ *Motor:* _${engine}_\n📝 *Prompt:* _"${prompt}"_${note ? `\n\n${note}` : ''}`;

                await this.sock.sendMessage(remoteJid, {
                    image: buffer,
                    caption
                }, { quoted: rawMsg });

                try {
                    await this.sock.sendMessage(remoteJid, { react: { text: '✅', key: rawMsg.key } });
                } catch {}

                this.addLog('info', `✅ Imagem gerada com sucesso (${engine}) para: "${prompt}"`);
            } catch (err) {
                try {
                    await this.sock.sendMessage(remoteJid, { react: { text: '❌', key: rawMsg.key } });
                } catch {}

                this.addLog('error', `❌ Falha ao gerar imagem: ${err.message}`);
                await this.sock.sendMessage(remoteJid, {
                    text: `❌ *Erro ao gerar imagem:*\n${err.message}\n\nTente novamente ou use uma descrição mais simples.`
                }, { quoted: rawMsg });
            }
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
