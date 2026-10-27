import fs from 'fs';
import path from 'path';

export class MarketManager {
    constructor() {
        this.filePath = path.resolve('./mercado_lista.json');
        this.items = [];
        this.lastSuggestions = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
                if (Array.isArray(data)) {
                    this.items = data;
                }
            }
        } catch {
            this.items = [];
        }
    }

    save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.items, null, 2), 'utf8');
        } catch (err) {
            console.error('Erro ao salvar mercado_lista.json:', err.message);
        }
    }

    getItems() {
        return this.items;
    }

    addItem(nameOrNames) {
        if (!nameOrNames) return [];

        const rawList = Array.isArray(nameOrNames)
            ? nameOrNames
            : String(nameOrNames).split(/[,;\n]+/);

        const added = [];
        for (let raw of rawList) {
            const clean = raw.trim();
            if (!clean) continue;

            const item = {
                id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                name: clean.charAt(0).toUpperCase() + clean.slice(1),
                checked: false,
                createdAt: new Date().toISOString()
            };
            this.items.push(item);
            added.push(item);
        }

        if (added.length > 0) {
            this.save();
        }
        return added;
    }

    removeItem(identifier) {
        if (identifier === undefined || identifier === null) return null;

        const str = String(identifier).trim();
        const num = parseInt(str, 10);

        let removed = null;
        if (!isNaN(num) && num >= 1 && num <= this.items.length) {
            // Remoção por índice (1-based)
            removed = this.items.splice(num - 1, 1)[0];
        } else {
            // Remoção por busca de nome ou ID
            const lower = str.toLowerCase();
            const index = this.items.findIndex(i => i.id === str || i.name.toLowerCase() === lower || i.name.toLowerCase().includes(lower));
            if (index !== -1) {
                removed = this.items.splice(index, 1)[0];
            }
        }

        if (removed) {
            this.save();
        }
        return removed;
    }

    toggleItem(id) {
        const item = this.items.find(i => i.id === id);
        if (item) {
            item.checked = !item.checked;
            this.save();
            return item;
        }
        return null;
    }

    clearList() {
        const count = this.items.length;
        this.items = [];
        this.lastSuggestions = [];
        this.save();
        return count;
    }

    async generateSuggestions(groqClient) {
        if (!groqClient) {
            throw new Error('Groq SDK não inicializado (GROQ_API_KEY ausente).');
        }

        const currentNames = this.items.map(i => i.name);
        const prompt = currentNames.length > 0
            ? `Você é um assistente de supermercado inteligente. A lista atual de compras tem os seguintes itens:\n${currentNames.join(', ')}\n\nSugira de 4 a 6 itens adicionais comuns e complementares que combinem com essa lista ou que sejam essenciais em um supermercado. Retorne APENAS uma lista simples de itens separados por vírgula (ex: Açúcar, Manteiga, Ovos, Detergente), sem explicações ou introdução.`
            : `Você é um assistente de supermercado inteligente. A lista de compras atual está vazia. Sugira de 4 a 6 itens essenciais de supermercado do dia a dia (alimentos ou higiene/limpeza). Retorne APENAS uma lista simples de itens separados por vírgula (ex: Arroz, Feijão, Leite, Café, Ovos), sem explicações ou introdução.`;

        try {
            const completion = await groqClient.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'openai/gpt-oss-120b',
                max_tokens: 120,
                temperature: 0.6
            });

            const text = completion.choices[0]?.message?.content || '';
            // Extrai itens separados por vírgula ou linhas numeradas
            const lines = text
                .split(/[,;\n]+/)
                .map(s => s.replace(/^\d+[\.\)\-]\s*/, '').replace(/^[-•*]\s*/, '').trim())
                .filter(s => s.length > 1 && !s.toLowerCase().includes('aqui estão') && !s.toLowerCase().includes('sugest'));

            const unique = Array.from(new Set(lines)).slice(0, 6);
            this.lastSuggestions = unique;
            return unique;
        } catch (err) {
            throw new Error(`Falha ao gerar sugestões com IA: ${err.message}`);
        }
    }

    applyLastSuggestions() {
        if (!this.lastSuggestions || this.lastSuggestions.length === 0) {
            return [];
        }

        const added = this.addItem(this.lastSuggestions);
        const count = this.lastSuggestions.length;
        this.lastSuggestions = [];
        return added;
    }

    formatWhatsAppList() {
        if (this.items.length === 0) {
            return `🛒 *Sua lista de mercado está vazia!*\n\n💡 Use */mercado adicionar [produto]* para incluir itens na lista.`;
        }

        let msg = `🛒 *Lista de Compras de Supermercado:*\n\n`;
        this.items.forEach((item, index) => {
            const mark = item.checked ? '☑️' : '◻️';
            const text = item.checked ? `~${item.name}~` : item.name;
            msg += `${mark} *${index + 1}.* ${text}\n`;
        });

        const total = this.items.length;
        const checkedCount = this.items.filter(i => i.checked).length;
        msg += `\n📊 *Total:* ${total} produto${total > 1 ? 's' : ''} (${checkedCount} comprado${checkedCount > 1 ? 's' : ''})\n`;
        msg += `\n💡 *Comandos úteis:*\n• */mercado adicionar [item]*\n• */mercado remover [número]*\n• */mercado sugestão*\n• */mercado limpar*`;

        return msg;
    }
}
