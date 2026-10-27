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
const marketCategorySelect = document.getElementById('marketCategorySelect');
const marketCategoryFilters = document.getElementById('marketCategoryFilters');
const btnAddMarketItem = document.getElementById('btnAddMarketItem');
const aiSuggestionsBox = document.getElementById('aiSuggestionsBox');
const aiSuggestionsChips = document.getElementById('aiSuggestionsChips');
const btnApplyAllSuggestions = document.getElementById('btnApplyAllSuggestions');
const marketListContainer = document.getElementById('marketListContainer');
const emptyMarketState = document.getElementById('emptyMarketState');

// Elementos da Whitelist de Comandos
const whitelistCountBadge = document.getElementById('whitelistCountBadge');
const whitelistPhoneInput = document.getElementById('whitelistPhoneInput');
const whitelistNameInput = document.getElementById('whitelistNameInput');
const btnAddWhitelistNumber = document.getElementById('btnAddWhitelistNumber');
const whitelistContainer = document.getElementById('whitelistContainer');

// Estado de filtro de categorias
let activeCategoryFilter = 'all';
let cachedMarketItems = [];

const CATEGORY_META = {
    'Hortifrúti': { icon: '🥬', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' },
    'Carnes & Açougue': { icon: '🥩', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)' },
    'Frios & Laticínios': { icon: '🧀', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' },
    'Padaria & Sobremesas': { icon: '🥖', color: '#D97706', bg: 'rgba(217, 119, 6, 0.15)', border: 'rgba(217, 119, 6, 0.3)' },
    'Mercearia & Despensa': { icon: '🌾', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.3)' },
    'Bebidas': { icon: '🥤', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)' },
    'Limpeza': { icon: '🧼', color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.3)' },
    'Higiene & Cuidados': { icon: '🧴', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.3)' },
    'Congelados': { icon: '❄️', color: '#6366F1', bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.3)' },
    'Pet Shop': { icon: '🐶', color: '#14B8A6', bg: 'rgba(20, 184, 166, 0.15)', border: 'rgba(20, 184, 166, 0.3)' },
    'Outros': { icon: '📦', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.15)', border: 'rgba(156, 163, 175, 0.3)' }
};

const CATEGORY_ORDER = [
    'Hortifrúti',
    'Carnes & Açougue',
    'Frios & Laticínios',
    'Padaria & Sobremesas',
    'Mercearia & Despensa',
    'Bebidas',
    'Limpeza',
    'Higiene & Cuidados',
    'Congelados',
    'Pet Shop',
    'Outros'
];

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

    eventSource.addEventListener('whitelist_init', (e) => {
        const items = JSON.parse(e.data);
        renderWhitelist(items);
    });

    eventSource.addEventListener('whitelist_update', (e) => {
        const items = JSON.parse(e.data);
        renderWhitelist(items);
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

    if (data.whitelist) {
        renderWhitelist(data.whitelist);
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
// Lista de Mercado (Frontend com Categorias)
// ==========================================
function renderMarketItems(items) {
    if (!Array.isArray(items)) return;
    cachedMarketItems = items;

    const total = items.length;
    const pending = items.filter(i => !i.checked).length;
    const checked = total - pending;

    marketBadgeCount.textContent = pending;
    marketStatusStats.textContent = `${total} produto${total === 1 ? '' : 's'} (${checked} comprado${checked === 1 ? '' : 's'})`;

    if (total === 0) {
        marketListContainer.innerHTML = '';
        marketListContainer.appendChild(emptyMarketState);
        emptyMarketState.classList.remove('hidden');
        if (marketCategoryFilters) marketCategoryFilters.innerHTML = '';
        return;
    }

    emptyMarketState.classList.add('hidden');
    marketListContainer.innerHTML = '';

    // 1. Agrupar itens por categoria mantendo ordenação de supermercado
    const groups = {};
    for (const cat of CATEGORY_ORDER) {
        groups[cat] = [];
    }

    // Ordenar itens por ordem de seções do mercado e ordem alfabética interna
    const sortedItems = [...items].sort((a, b) => {
        const catA = a.category || 'Outros';
        const catB = b.category || 'Outros';
        const idxA = CATEGORY_ORDER.indexOf(catA);
        const idxB = CATEGORY_ORDER.indexOf(catB);
        const orderA = idxA === -1 ? 999 : idxA;
        const orderB = idxB === -1 ? 999 : idxB;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, 'pt-BR');
    });

    // Mapeia o número global (1-based) para coincidir perfeitamente com os comandos do WhatsApp
    const itemNumberMap = new Map();
    sortedItems.forEach((item, index) => {
        itemNumberMap.set(item.id, index + 1);
        const cat = item.category || 'Outros';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    });

    // 2. Renderizar pílulas de filtro de categorias
    renderCategoryFilters(groups, total);

    // 3. Renderizar cada seção de categoria
    for (const catName of CATEGORY_ORDER) {
        const catItems = groups[catName] || [];
        if (catItems.length === 0) continue;

        // Se houver filtro ativo e não for 'all', pula as outras categorias
        if (activeCategoryFilter !== 'all' && activeCategoryFilter !== catName) {
            continue;
        }

        const meta = CATEGORY_META[catName] || { icon: '📦', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.15)', border: 'rgba(156, 163, 175, 0.3)' };
        const catTotal = catItems.length;
        const catChecked = catItems.filter(i => i.checked).length;

        const groupCard = document.createElement('div');
        groupCard.className = 'market-category-group';

        const header = document.createElement('div');
        header.className = 'market-category-header';
        header.innerHTML = `
            <div class="market-category-title">
                <span>${meta.icon}</span>
                <span>${escapeHtml(catName)}</span>
            </div>
            <span class="market-category-count" style="color: ${meta.color}; border: 1px solid ${meta.border}">
                ${catChecked}/${catTotal} comprado${catTotal === 1 ? '' : 's'}
            </span>
        `;
        groupCard.appendChild(header);

        // Itens da categoria
        catItems.forEach((item) => {
            const globalNum = itemNumberMap.get(item.id) || 1;
            const row = document.createElement('div');
            row.className = 'market-item-row';
            row.id = `mkt-${item.id}`;
            row.innerHTML = `
                <label class="market-item-left" title="Marcar como comprado">
                    <input type="checkbox" class="market-item-checkbox" ${item.checked ? 'checked' : ''} onchange="toggleMarketItem('${item.id}')">
                    <span class="market-item-name ${item.checked ? 'checked' : ''}">
                        <strong>${globalNum}.</strong> ${escapeHtml(item.name)}
                    </span>
                    <span class="market-item-cat-tag" style="background: ${meta.bg}; color: ${meta.color}; border-color: ${meta.border}">
                        ${meta.icon} ${escapeHtml(catName)}
                    </span>
                </label>
                <button class="market-item-del" onclick="deleteMarketItem('${item.id}')" title="Excluir produto">🗑️</button>
            `;
            groupCard.appendChild(row);
        });

        marketListContainer.appendChild(groupCard);
    }
}

function renderCategoryFilters(groups, total) {
    if (!marketCategoryFilters) return;
    marketCategoryFilters.innerHTML = '';

    // Pílula 'Todos'
    const allBtn = document.createElement('button');
    allBtn.className = `cat-filter-btn ${activeCategoryFilter === 'all' ? 'active' : ''}`;
    allBtn.innerHTML = `<span>🛒 Todos</span> <span class="cat-filter-badge">${total}</span>`;
    allBtn.onclick = () => {
        activeCategoryFilter = 'all';
        renderMarketItems(cachedMarketItems);
    };
    marketCategoryFilters.appendChild(allBtn);

    // Pílulas das categorias presentes
    for (const catName of CATEGORY_ORDER) {
        const catItems = groups[catName] || [];
        if (catItems.length === 0) continue;

        const meta = CATEGORY_META[catName] || { icon: '📦' };
        const btn = document.createElement('button');
        btn.className = `cat-filter-btn ${activeCategoryFilter === catName ? 'active' : ''}`;
        btn.innerHTML = `<span>${meta.icon} ${escapeHtml(catName)}</span> <span class="cat-filter-badge">${catItems.length}</span>`;
        btn.onclick = () => {
            activeCategoryFilter = activeCategoryFilter === catName ? 'all' : catName;
            renderMarketItems(cachedMarketItems);
        };
        marketCategoryFilters.appendChild(btn);
    }
}

async function addMarketItem() {
    const text = marketInputItem.value.trim();
    if (!text) return;

    const selectedCategory = marketCategorySelect ? marketCategorySelect.value : 'auto';

    btnAddMarketItem.disabled = true;
    try {
        const res = await fetch('/api/market/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: text,
                category: selectedCategory === 'auto' ? null : selectedCategory
            })
        });
        const data = await res.json();
        if (data.success) {
            marketInputItem.value = '';
            if (marketCategorySelect) marketCategorySelect.value = 'auto';
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

// ==========================================
// Whitelist de Números Autorizados
// ==========================================
function formatPhone(phone) {
    const clean = (phone || '').replace(/\D/g, '');
    if (clean.length === 13) {
        return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    } else if (clean.length === 11) {
        return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }
    return `+${clean}`;
}

function renderWhitelist(whitelist) {
    if (!whitelistContainer) return;
    if (!Array.isArray(whitelist)) return;

    if (whitelistCountBadge) {
        whitelistCountBadge.textContent = `${whitelist.length} autorizado${whitelist.length === 1 ? '' : 's'}`;
    }

    if (whitelist.length === 0) {
        whitelistContainer.innerHTML = `
            <div class="whitelist-empty">
                Nenhum número cadastrado na whitelist.<br>
                <span>Apenas você pode executar comandos no WhatsApp.</span>
            </div>
        `;
        return;
    }

    whitelistContainer.innerHTML = '';
    whitelist.forEach(item => {
        const row = document.createElement('div');
        row.className = 'whitelist-item-row';
        const lidBadge = item.lid
            ? `<span class="whitelist-item-phone" title="WhatsApp LID mapeado: ${item.lid}">LID OK ✅</span>`
            : '';
        row.innerHTML = `
            <div class="whitelist-item-info">
                <span>👤</span>
                <span class="whitelist-item-name">${escapeHtml(item.name || 'Autorizado')}</span>
                <span class="whitelist-item-phone">${escapeHtml(formatPhone(item.phone))}</span>
                ${lidBadge}
            </div>
            <button class="whitelist-item-del" onclick="removeWhitelistNumber('${item.phone}')" title="Revogar acesso aos comandos">🗑️</button>
        `;
        whitelistContainer.appendChild(row);
    });
}

async function addWhitelistNumber() {
    if (!whitelistPhoneInput) return;
    const phone = whitelistPhoneInput.value.trim();
    const name = whitelistNameInput ? whitelistNameInput.value.trim() : '';

    if (!phone) {
        showToast('Informe o número de telefone (com DDI e DDD)', 'error');
        whitelistPhoneInput.focus();
        return;
    }

    if (btnAddWhitelistNumber) btnAddWhitelistNumber.disabled = true;

    try {
        const res = await fetch('/api/whitelist/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name })
        });
        const data = await res.json();
        if (data.success) {
            whitelistPhoneInput.value = '';
            if (whitelistNameInput) whitelistNameInput.value = '';
            showToast('Número autorizado com sucesso!', 'info');
        } else {
            showToast(data.error || 'Erro ao autorizar número', 'error');
        }
    } catch (e) {
        showToast('Erro de rede: ' + e.message, 'error');
    } finally {
        if (btnAddWhitelistNumber) btnAddWhitelistNumber.disabled = false;
    }
}

window.removeWhitelistNumber = async function(phone) {
    const confirmRemove = confirm(`Deseja revogar o acesso do número +${phone}?`);
    if (!confirmRemove) return;

    try {
        const res = await fetch('/api/whitelist/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Acesso revogado com sucesso!', 'info');
        } else {
            showToast(data.error || 'Erro ao remover', 'error');
        }
    } catch (e) {
        showToast('Erro de rede: ' + e.message, 'error');
    }
};

if (btnAddWhitelistNumber) {
    btnAddWhitelistNumber.addEventListener('click', addWhitelistNumber);
}

if (whitelistPhoneInput) {
    whitelistPhoneInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addWhitelistNumber();
        }
    });
}

if (whitelistNameInput) {
    whitelistNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addWhitelistNumber();
        }
    });
}

// Inicializar ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    setupEventSource();
});
