import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { BotManager } from './src/botManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const bot = new BotManager();
const sseClients = new Set();
const recentLogs = [];

function broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(payload);
        } catch {
            sseClients.delete(client);
        }
    }
}

bot.on('status_change', (status) => {
    broadcastSSE('status', status);
});

bot.on('transcription_update', (item) => {
    broadcastSSE('transcription', item);
});

bot.on('log', (log) => {
    recentLogs.push(log);
    if (recentLogs.length > 100) recentLogs.shift();
    broadcastSSE('log', log);
});

// SSE endpoint para atualizações em tempo real no frontend
app.get('/api/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    res.write(`event: status\ndata: ${JSON.stringify(bot.getStatus())}\n\n`);
    res.write(`event: logs_init\ndata: ${JSON.stringify(recentLogs.slice(-25))}\n\n`);
    res.write(`event: transcriptions_init\ndata: ${JSON.stringify(bot.recentTranscriptions)}\n\n`);

    sseClients.add(res);

    req.on('close', () => {
        sseClients.delete(res);
    });
});

// Keep-alive a cada 20s para manter as conexões SSE ativas
setInterval(() => {
    for (const client of sseClients) {
        try {
            client.write(': keep-alive\n\n');
        } catch {
            sseClients.delete(client);
        }
    }
}, 20000);

// Rotas REST
app.get('/api/status', (req, res) => {
    res.json(bot.getStatus());
});

app.post('/api/bot/start', async (req, res) => {
    try {
        await bot.start();
        res.json({ success: true, status: bot.getStatus() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/bot/pairing-code', async (req, res) => {
    const { phoneNumber } = req.body;
    try {
        const code = await bot.requestPairingCode(phoneNumber);
        res.json({ success: true, code, status: bot.getStatus() });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/bot/stop', async (req, res) => {
    try {
        await bot.stop();
        res.json({ success: true, status: bot.getStatus() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/bot/toggle-transcribing', (req, res) => {
    const { enabled } = req.body;
    const newState = enabled !== undefined ? Boolean(enabled) : !bot.isTranscribingEnabled;
    bot.setTranscribingEnabled(newState);
    res.json({ success: true, isTranscribingEnabled: bot.isTranscribingEnabled });
});

app.post('/api/bot/logout', async (req, res) => {
    try {
        await bot.logout();
        res.json({ success: true, status: bot.getStatus() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/config', (req, res) => {
    const updated = bot.updateConfig(req.body);
    res.json({ success: true, config: updated });
});

app.get('/api/transcriptions', (req, res) => {
    res.json({ transcriptions: bot.recentTranscriptions });
});

app.get('/api/logs', (req, res) => {
    res.json({ logs: recentLogs });
});

// Rota fallback para SPA
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicialização do servidor web
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Painel Web do WhatsApp Transcritor iniciado!`);
    console.log(`🌐 Acesse no seu navegador: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
});

// Encerramento limpo em caso de CTRL+C
process.on('SIGINT', async () => {
    console.log('\nFinalizando servidor e conexão WhatsApp...');
    await bot.stop();
    process.exit(0);
});
