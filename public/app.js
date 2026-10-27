// WhatsApp Transcritor - Client Dashboard

let currentStatus = 'STOPPED';
let isTranscribing = true;
let eventSource = null;
const transcriptionsMap = new Map();

// Elementos DOM
const connectionPill = document.getElementById('connectionPill');
const connectionPillText = document.getElementById('connectionPillText');
const btnToggleBot = document.getElementById('btnToggleBot');
const btnTogglePause = document.getElementById('btnTogglePause');
const btnLogout = document.getElementById('btnLogout');
const transcriptionStateBadge = document.getElementById('transcriptionStateBadge');

const qrCodeView = document.getElementById('qrCodeView');
const connectedView = document.getElementById('connectedView');
const idleView = document.getElementById('idleView');
const qrImage = document.getElementById('qrImage');

const connectedUserName = document.getElementById('connectedUserName');
const connectedUserPhone = document.getElementById('connectedUserPhone');

const statTotalTranscribed = document.getElementById('statTotalTranscribed');
const statTotalErrors = document.getElementById('statTotalErrors');
const statApiStatus = document.getElementById('statApiStatus');

const cfgPrivateAudio = document.getElementById('cfgPrivateAudio');
const cfgMyOwnAudio = document.getElementById('cfgMyOwnAudio');
const cfgGroupMode = document.getElementById('cfgGroupMode');

const transcriptionsList = document.getElementById('transcriptionsList');
const emptyFeedState = document.getElementById('emptyFeedState');
const feedCountBadge = document.getElementById('feedCountBadge');
const btnClearFeed = document.getElementById('btnClearFeed');

const logsHeaderToggle = document.getElementById('logsHeaderToggle');
const logsBody = document.getElementById('logsBody');
const logsContainer = document.getElementById('logsContainer');
const toastContainer = document.getElementById('toastContainer');

// Elementos de Método de Conexão (QR vs Código)
const tabQrMethod = document.getElementById('tabQrMethod');
const tabPairingMethod = document.getElementById('tabPairingMethod');
const qrMethodSection = document.getElementById('qrMethodSection');
const pairingMethodSection = document.getElementById('pairingMethodSection');
const pairingPhoneInput = document.getElementById('pairingPhoneInput');
const btnRequestPairingCode = document.getElementById('btnRequestPairingCode');
const pairingCodeDisplayBox = document.getElementById('pairingCodeDisplayBox');
const pairingCodeValue = document.getElementById('pairingCodeValue');
const btnCopyPairingCode = document.getElementById('btnCopyPairingCode');

// Navegação Principal (Abas)
const navTabTranscriber = document.getElementById('navTabTranscriber');
const navTabMarket = document.getElementById('navTabMarket');
const viewTranscriber = document.getElementById('viewTranscriber');
const viewMarket = document.getElementById('viewMarket');
const marketBadgeCount = document.getElementById('marketBadgeCount');

// Elementos da Lista de Mercado
const marketStatusStats = document.getElementById('marketStatusStats');
const btnAiSuggest = document.getElementById('btnAiSuggest');
const btnClearMarket = document.getElementById('btnClearMarket');
const marketInputItem = document.getElementById('marketInputItem');
const btnAddMarketItem = document.getElementById('btnAddMarketItem');
const aiSuggestionsBox = document.getElementById('aiSuggestionsBox');
const aiSuggestionsChips = document.getElementById('aiSuggestionsChips');
const btnApplyAllSuggestions = document.getElementById('btnApplyAllSuggestions');
const marketListContainer = document.getElementById('marketListContainer');
const emptyMarketState = document.getElementById('emptyMarketState');

// Inicialização da conexão SSE
function setupEventSource() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource('/api/events');

    eventSource.addEventListener('status', (e) => {
        const data = JSON.parse(e.data);
        updateStatusUI(data);
    });

    eventSource.addEventListener('transcription', (e) => {
        const item = JSON.parse(e.data);
        renderTranscriptionItem(item);
    });

    eventSource.addEventListener('transcriptions_init', (e) => {
        const items = JSON.parse(e.data);
        if (Array.isArray(items)) {
            items.reverse().forEach((item) => renderTranscriptionItem(item));
        }
    });

    eventSource.addEventListener('market_init', (e) => {
        const items = JSON.parse(e.data);
        renderMarketItems(items);
    });

    eventSource.addEventListener('market_update', (e) => {
        const items = JSON.parse(e.data);
        renderMarketItems(items);
    });

    eventSource.addEventListener('log', (e) => {
        const log = JSON.parse(e.data);
        appendLog(log);
    });

    eventSource.addEventListener('logs_init', (e) => {
        const logs = JSON.parse(e.data);
        logsContainer.innerHTML = '';
        if (Array.isArray(logs)) {
            logs.forEach((log) => appendLog(log));
        }
    });

    eventSource.onerror = () => {
        // Fallback de reconexão automática
        console.warn('Conexão SSE perdida. Tentando reconectar...');
    };
}

// Atualização da UI conforme status do Bot
function updateStatusUI(data) {
    currentStatus = data.status;
    isTranscribing = data.isTranscribingEnabled;

    // Atualiza estatísticas
    if (data.stats) {
        statTotalTranscribed.textContent = data.stats.totalTranscribed || 0;
        statTotalErrors.textContent = data.stats.totalErrors || 0;
    }

    statApiStatus.textContent = data.hasGroqKey ? 'Groq OK' : 'Chave Ausente';
    statApiStatus.className = data.hasGroqKey ? 'metric-value text-success' : 'metric-value text-danger';

    // Atualiza badge de estado de transcrição
    if (isTranscribing) {
        transcriptionStateBadge.textContent = 'Transcrição Ativa';
        transcriptionStateBadge.className = 'badge badge-success';
        btnTogglePause.querySelector('.btn-label').textContent = 'Pausar Transcrições';
        btnTogglePause.querySelector('.btn-icon').textContent = '⏸️';
    } else {
        transcriptionStateBadge.textContent = 'Transcrição Pausada';
        transcriptionStateBadge.className = 'badge badge-neutral';
        btnTogglePause.querySelector('.btn-label').textContent = 'Retomar Transcrições';
        btnTogglePause.querySelector('.btn-icon').textContent = '▶️';
    }

    // Atualiza inputs de configuração se não estiverem em foco
    if (data.config) {
        if (document.activeElement !== cfgPrivateAudio) cfgPrivateAudio.checked = Boolean(data.config.transcribePrivateAudio);
        if (document.activeElement !== cfgMyOwnAudio) cfgMyOwnAudio.checked = Boolean(data.config.transcribeMyOwnAudio);
        if (document.activeElement !== cfgGroupMode) cfgGroupMode.value = data.config.groupMode || 'command';
    }

    // Configuração dos Botões e Views conforme Status
    connectionPill.className = 'status-pill';

    if (currentStatus === 'CONNECTED') {
        connectionPill.classList.add('status-connected');
        connectionPillText.textContent = 'Conectado';

        btnToggleBot.className = 'btn btn-large btn-danger-mode';
        btnToggleBot.querySelector('.btn-icon').textContent = '⏹️';
        btnToggleBot.querySelector('.btn-label').textContent = 'Desligar Transcritor';
        btnToggleBot.disabled = false;

        idleView.classList.add('hidden');
        qrCodeView.classList.add('hidden');
        connectedView.classList.remove('hidden');

        if (data.connectedUser) {
            connectedUserName.textContent = data.connectedUser.name || 'Usuário Conectado';
            connectedUserPhone.textContent = data.connectedUser.phone ? `+${data.connectedUser.phone}` : 'WhatsApp Web';
        }

    } else if (currentStatus === 'WAITING_QR') {
        connectionPill.classList.add('status-waiting');
        connectionPillText.textContent = 'Aguardando QR Code';

        btnToggleBot.className = 'btn btn-large btn-danger-mode';
        btnToggleBot.querySelector('.btn-icon').textContent = '⏹️';
        btnToggleBot.querySelector('.btn-label').textContent = 'Cancelar Inicialização';
        btnToggleBot.disabled = false;

        idleView.classList.add('hidden');
        connectedView.classList.add('hidden');
        qrCodeView.classList.remove('hidden');

        if (data.qrCodeDataUrl) {
            qrImage.src = data.qrCodeDataUrl;
            qrImage.classList.remove('hidden');
        }

        if (data.pairingCode) {
            pairingCodeValue.textContent = data.pairingCode;
            pairingCodeDisplayBox.classList.remove('hidden');
        }

    } else if (currentStatus === 'STARTING') {
        connectionPill.classList.add('status-starting');
        connectionPillText.textContent = 'Iniciando...';

        btnToggleBot.className = 'btn btn-large btn-secondary';
        btnToggleBot.querySelector('.btn-icon').textContent = '⏳';
        btnToggleBot.querySelector('.btn-label').textContent = 'Iniciando conexão...';
        btnToggleBot.disabled = true;

        idleView.classList.remove('hidden');
        connectedView.classList.add('hidden');
        qrCodeView.classList.add('hidden');

    } else { // STOPPED ou ERROR
        connectionPill.classList.add('status-stopped');
        connectionPillText.textContent = currentStatus === 'ERROR' ? 'Erro de Conexão' : 'Desligado';

        btnToggleBot.className = 'btn btn-large btn-primary';
        btnToggleBot.querySelector('.btn-icon').textContent = '▶️';
        btnToggleBot.querySelector('.btn-label').textContent = 'Ligar Transcritor';
        btnToggleBot.disabled = false;

        idleView.classList.remove('hidden');
        connectedView.classList.add('hidden');
        qrCodeView.classList.add('hidden');
    }
}

// Ações do Usuário
btnToggleBot.addEventListener('click', async () => {
    btnToggleBot.disabled = true;
    try {
        if (currentStatus === 'STOPPED' || currentStatus === 'ERROR') {
            showToast('Iniciando o transcritor do WhatsApp...', 'info');
            await fetch('/api/bot/start', { method: 'POST' });
        } else {
            showToast('Desligando o transcritor...', 'info');
            await fetch('/api/bot/stop', { method: 'POST' });
        }
    } catch (err) {
        showToast('Erro ao comunicar com o servidor: ' + err.message, 'error');
        btnToggleBot.disabled = false;
    }
});

btnTogglePause.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/bot/toggle-transcribing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !isTranscribing })
        });
        const data = await res.json();
        showToast(data.isTranscribingEnabled ? 'Transcrições retomadas!' : 'Transcrições pausadas!', 'info');
    } catch (err) {
        showToast('Erro ao alternar pausa: ' + err.message, 'error');
    }
});

btnLogout.addEventListener('click', async () => {
    const confirmLogout = confirm('Tem certeza que deseja desconectar o WhatsApp desta sessão?\n\nIsso removerá as credenciais salvas e um novo QR Code precisará ser escaneado.');
    if (!confirmLogout) return;

    try {
        showToast('Desconectando sessão...', 'info');
        await fetch('/api/bot/logout', { method: 'POST' });
        showToast('Sessão encerrada com sucesso.', 'info');
    } catch (err) {
        showToast('Erro ao desconectar: ' + err.message, 'error');
    }
});

// Alternar Abas de Conexão (QR Code vs Código de 8 Dígitos)
if (tabQrMethod && tabPairingMethod) {
    tabQrMethod.addEventListener('click', () => {
        tabQrMethod.classList.add('active');
        tabPairingMethod.classList.remove('active');
        qrMethodSection.classList.remove('hidden');
        pairingMethodSection.classList.add('hidden');
    });

    tabPairingMethod.addEventListener('click', () => {
        tabPairingMethod.classList.add('active');
        tabQrMethod.classList.remove('active');
        pairingMethodSection.classList.remove('hidden');
        qrMethodSection.classList.add('hidden');
    });
}

if (btnRequestPairingCode) {
    btnRequestPairingCode.addEventListener('click', async () => {
        const phone = pairingPhoneInput.value.trim();
        if (!phone) {
            showToast('Informe o número com DDI e DDD.', 'error');
            return;
        }

        btnRequestPairingCode.disabled = true;
        btnRequestPairingCode.textContent = 'Gerando...';

        try {
            const res = await fetch('/api/bot/pairing-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: phone })
            });

            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                showToast('Servidor desatualizado! Feche a janela preta do iniciar.bat e abra-a novamente.', 'error');
                return;
            }

            const data = await res.json();
            if (data.success && data.code) {
                pairingCodeValue.textContent = data.code;
                pairingCodeDisplayBox.classList.remove('hidden');
                showToast('Código gerado com sucesso! Digite no WhatsApp.', 'info');
            } else {
                showToast(data.error || 'Erro ao gerar código.', 'error');
            }
        } catch (e) {
            showToast('Falha na requisição: ' + e.message, 'error');
        } finally {
            btnRequestPairingCode.disabled = false;
            btnRequestPairingCode.textContent = 'Gerar Código';
        }
    });
}

if (btnCopyPairingCode) {
    btnCopyPairingCode.addEventListener('click', () => {
        const code = pairingCodeValue.textContent.replace('-', '').trim();
        copyText(code);
    });
}

// Atualização de Configurações
async function saveConfig() {
    const payload = {
        transcribePrivateAudio: cfgPrivateAudio.checked,
        transcribeMyOwnAudio: cfgMyOwnAudio.checked,
        groupMode: cfgGroupMode.value
    };

    try {
        await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast('Preferências salvas!', 'info');
    } catch (err) {
        showToast('Erro ao salvar preferências', 'error');
    }
}

cfgPrivateAudio.addEventListener('change', saveConfig);
cfgMyOwnAudio.addEventListener('change', saveConfig);
cfgGroupMode.addEventListener('change', saveConfig);

// Renderização do Feed de Transcrições
function renderTranscriptionItem(item) {
    if (!item || !item.id) return;

    emptyFeedState.classList.add('hidden');

    let card = document.getElementById(`tr-item-${item.id}`);
    const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isFromMe = item.fromMe ? '(Enviado por mim)' : '(Recebido)';
    const origin = item.isGroup ? `👥 Grupo [${item.sender}]` : `👤 Privado [${item.sender}]`;

    let statusHtml = '';
    let textClass = 'transcription-text';

    if (item.status === 'processing') {
        statusHtml = '<span class="badge badge-neutral" style="color: #FBBF24;">⏳ Transcrevendo...</span>';
        textClass += ' processing';
    } else if (item.status === 'success') {
        statusHtml = '<span class="badge badge-success">✅ Concluído</span>';
    } else if (item.status === 'empty') {
        statusHtml = '<span class="badge badge-neutral">❓ Sem fala</span>';
    } else {
        statusHtml = '<span class="badge badge-neutral text-danger">❌ Erro</span>';
        textClass += ' error';
    }

    const textContent = item.text || (item.status === 'processing' ? 'Ouvindo e transcrevendo áudio via Whisper Large v3...' : (item.error || 'Falha ao transcrever'));

    if (!card) {
        card = document.createElement('div');
        card.id = `tr-item-${item.id}`;
        card.className = 'transcription-card';
        transcriptionsList.prepend(card);
    }

    card.innerHTML = `
        <div class="transcription-header">
            <div class="transcription-sender">
                <span>${origin}</span>
                <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">${isFromMe}</span>
            </div>
            <div class="transcription-meta">
                <span>${timeStr}</span>
                ${statusHtml}
            </div>
        </div>
        <div class="${textClass}">${escapeHtml(textContent)}</div>
        <div class="transcription-footer">
            <span style="color: var(--text-muted);">Groq Whisper v3</span>
            ${item.status === 'success' ? `<button class="btn-copy" onclick="copyText('${escapeQuotes(item.text)}')">📋 Copiar Texto</button>` : ''}
        </div>
    `;

    transcriptionsMap.set(item.id, item);
    feedCountBadge.textContent = `${transcriptionsMap.size} áudios`;
}

btnClearFeed.addEventListener('click', () => {
    transcriptionsMap.clear();
    transcriptionsList.querySelectorAll('.transcription-card').forEach(c => c.remove());
    emptyFeedState.classList.remove('hidden');
    feedCountBadge.textContent = '0 áudios';
});

// Manipulação do Console de Logs
function appendLog(log) {
    const line = document.createElement('div');
    const levelClass = log.level === 'error' ? 'log-error' : (log.level === 'warn' ? 'log-warn' : 'log-info');
    line.className = `log-line ${levelClass}`;

    const timeStr = new Date(log.timestamp).toLocaleTimeString();
    line.innerHTML = `
        <span class="log-time">[${timeStr}]</span>
        <span class="log-msg">${escapeHtml(log.message)}</span>
    `;

    logsContainer.appendChild(line);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

logsHeaderToggle.addEventListener('click', () => {
    logsBody.classList.toggle('hidden');
    const chevron = logsHeaderToggle.querySelector('.logs-chevron');
    chevron.classList.toggle('collapsed');
});

// Toast Helper
function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${type === 'error' ? '❌' : 'ℹ️'}</span><span>${escapeHtml(msg)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Utilitários de escape e cópia
function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Texto copiado para a área de transferência!', 'info');
    }).catch(() => {
        showToast('Não foi possível copiar o texto.', 'error');
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeQuotes(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, ' ');
}

// ==========================================
// Navegação entre Abas
// ==========================================
if (navTabTranscriber && navTabMarket) {
    navTabTranscriber.addEventListener('click', () => {
        navTabTranscriber.classList.add('active');
        navTabMarket.classList.remove('active');
        viewTranscriber.classList.remove('hidden');
        viewMarket.classList.add('hidden');
    });

    navTabMarket.addEventListener('click', () => {
        navTabMarket.classList.add('active');
        navTabTranscriber.classList.remove('active');
        viewMarket.classList.remove('hidden');
        viewTranscriber.classList.add('hidden');
    });
}

// ==========================================
// Lista de Mercado (Frontend)
// ==========================================
function renderMarketItems(items) {
    if (!Array.isArray(items)) return;

    const total = items.length;
    const pending = items.filter(i => !i.checked).length;
    const checked = total - pending;

    marketBadgeCount.textContent = pending;
    marketStatusStats.textContent = `${total} produto${total === 1 ? '' : 's'} (${checked} comprado${checked === 1 ? '' : 's'})`;

    if (total === 0) {
        marketListContainer.innerHTML = '';
        marketListContainer.appendChild(emptyMarketState);
        emptyMarketState.classList.remove('hidden');
        return;
    }

    emptyMarketState.classList.add('hidden');
    marketListContainer.innerHTML = '';

    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'market-item-row';
        row.id = `mkt-${item.id}`;
        row.innerHTML = `
            <label class="market-item-left" title="Marcar como comprado">
                <input type="checkbox" class="market-item-checkbox" ${item.checked ? 'checked' : ''} onchange="toggleMarketItem('${item.id}')">
                <span class="market-item-name ${item.checked ? 'checked' : ''}"><strong>${index + 1}.</strong> ${escapeHtml(item.name)}</span>
            </label>
            <button class="market-item-del" onclick="deleteMarketItem('${item.id}')" title="Excluir produto">🗑️</button>
        `;
        marketListContainer.appendChild(row);
    });
}

async function addMarketItem() {
    const text = marketInputItem.value.trim();
    if (!text) return;

    btnAddMarketItem.disabled = true;
    try {
        const res = await fetch('/api/market/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: text })
        });
        const data = await res.json();
        if (data.success) {
            marketInputItem.value = '';
            showToast('Produto(s) adicionado(s) com sucesso!', 'info');
        } else {
            showToast('Erro ao adicionar produto: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Erro de rede: ' + e.message, 'error');
    } finally {
        btnAddMarketItem.disabled = false;
        marketInputItem.focus();
    }
}

if (btnAddMarketItem) {
    btnAddMarketItem.addEventListener('click', addMarketItem);
}

if (marketInputItem) {
    marketInputItem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addMarketItem();
        }
    });
}

window.toggleMarketItem = async function(id) {
    try {
        await fetch('/api/market/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
    } catch (e) {
        showToast('Erro ao alternar produto', 'error');
    }
};

window.deleteMarketItem = async function(id) {
    try {
        await fetch('/api/market/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        showToast('Produto removido da lista!', 'info');
    } catch (e) {
        showToast('Erro ao remover produto', 'error');
    }
};

if (btnClearMarket) {
    btnClearMarket.addEventListener('click', async () => {
        const confirmClear = confirm('Tem certeza que deseja esvaziar toda a lista de compras?');
        if (!confirmClear) return;

        try {
            await fetch('/api/market/clear', { method: 'POST' });
            showToast('Lista de mercado esvaziada!', 'info');
        } catch (e) {
            showToast('Erro ao limpar lista', 'error');
        }
    });
}

// Sugestões com IA
if (btnAiSuggest) {
    btnAiSuggest.addEventListener('click', async () => {
        btnAiSuggest.disabled = true;
        btnAiSuggest.innerHTML = '<span>⏳</span><span>Pensando...</span>';

        try {
            const res = await fetch('/api/market/suggest');
            const data = await res.json();
            if (data.success && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
                renderSuggestionsChips(data.suggestions);
                aiSuggestionsBox.classList.remove('hidden');
                showToast('Sugestões geradas com IA!', 'info');
            } else {
                showToast(data.error || 'Nenhuma sugestão encontrada.', 'error');
            }
        } catch (e) {
            showToast('Erro ao solicitar sugestões: ' + e.message, 'error');
        } finally {
            btnAiSuggest.disabled = false;
            btnAiSuggest.innerHTML = '<span>✨</span><span>Sugestões da IA</span>';
        }
    });
}

function renderSuggestionsChips(suggestions) {
    aiSuggestionsChips.innerHTML = '';
    suggestions.forEach(item => {
        const chip = document.createElement('button');
        chip.className = 'sugg-chip';
        chip.innerHTML = `<span>➕</span><span>${escapeHtml(item)}</span>`;
        chip.onclick = () => applySingleSuggestion(item, chip);
        aiSuggestionsChips.appendChild(chip);
    });
}

async function applySingleSuggestion(name, chipElement) {
    try {
        await fetch('/api/market/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        showToast(`Adicionado: ${name}`, 'info');
        if (chipElement) chipElement.remove();
        if (aiSuggestionsChips.children.length === 0) {
            aiSuggestionsBox.classList.add('hidden');
        }
    } catch (e) {
        showToast('Erro ao adicionar sugestão', 'error');
    }
}

if (btnApplyAllSuggestions) {
    btnApplyAllSuggestions.addEventListener('click', async () => {
        btnApplyAllSuggestions.disabled = true;
        try {
            await fetch('/api/market/apply-suggestions', { method: 'POST' });
            aiSuggestionsBox.classList.add('hidden');
            showToast('Todas as sugestões foram adicionadas!', 'info');
        } catch (e) {
            showToast('Erro ao aplicar sugestões', 'error');
        } finally {
            btnApplyAllSuggestions.disabled = false;
        }
    });
}

// Inicializar ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    setupEventSource();
});
