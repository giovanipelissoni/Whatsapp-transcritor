import fs from 'fs';
import path from 'path';

export const MARKET_CATEGORIES = [
    { id: 'hortifruti', name: 'Hortifrúti', icon: '🥬', color: '#10B981', keywords: [
        'banana', 'maca', 'maçã', 'melancia', 'melao', 'melão', 'uva', 'laranja', 'limao', 'limão',
        'manga', 'abacaxi', 'morango', 'mamao', 'mamão', 'pera', 'pessego', 'pêssego', 'abacate',
        'maracuja', 'maracujá', 'goiaba', 'kiwi', 'caju', 'ameixa', 'figo', 'acerola', 'coco',
        'tangerina', 'mexerica', 'bergamota', 'carambola', 'framboesa', 'amora', 'mirtilo', 'cereja',
        'alface', 'rucula', 'rúcula', 'agriao', 'agrião', 'couve', 'espinafre', 'repolho', 'tomate',
        'cebola', 'alho', 'batata', 'cenoura', 'chuchu', 'abobora', 'abóbora', 'abobrinha', 'berinjela',
        'pimentao', 'pimentão', 'brocolis', 'brócolis', 'couve-flor', 'pepino', 'beterraba', 'mandioca',
        'aipim', 'macaxeira', 'cheiro verde', 'salsinha', 'salsa', 'cebolinha', 'coentro', 'hortela',
        'hortelã', 'gengibre', 'vagem', 'quiabo', 'rabanete', 'palmito fresco', 'cogumelo', 'champignon'
    ]},
    { id: 'carnes', name: 'Carnes & Açougue', icon: '🥩', color: '#EF4444', keywords: [
        'carne', 'alcatra', 'picanha', 'patinho', 'acem', 'acém', 'costela', 'frango', 'peito de frango',
        'coxa', 'sobrecoxa', 'asa de frango', 'file', 'filé', 'bife', 'carne moida', 'carne moída',
        'lombo', 'bisteca', 'maminha', 'contra file', 'contra filé', 'cupim', 'musculo', 'músculo',
        'ossobuco', 'rabada', 'figado', 'fígado', 'linguica', 'linguiça', 'bacon', 'costelinha',
        'peixe', 'salmao', 'salmão', 'tilapia', 'tilápia', 'camarao', 'camarão', 'atum fresco',
        'bacalhau', 'sardinha fresca', 'pernil', 'salsicha', 'carne de sol', 'carne seca', 'charque',
        'coracao de frango', 'coração de frango', 'cordeiro', 'chuleta'
    ]},
    { id: 'laticinios', name: 'Frios & Laticínios', icon: '🧀', color: '#F59E0B', keywords: [
        'leite', 'queijo', 'mussarela', 'muçarela', 'prato', 'parmesao', 'parmesão', 'provolone',
        'gorgonzola', 'ricota', 'queijo branco', 'queijo minas', 'queijo coalho', 'brie', 'gouda',
        'iogurte', 'yogurte', 'iogurt', 'danone', 'yakult', 'coalhada', 'manteiga', 'margarina',
        'requeijao', 'requeijão', 'cream cheese', 'creme de leite', 'leite condensado', 'ovo', 'ovos',
        'presunto', 'peito de peru', 'salame', 'mortadela', 'copa', 'nata', 'doce de leite',
        'leite em po', 'leite em pó', 'parma'
    ]},
    { id: 'padaria', name: 'Padaria & Sobremesas', icon: '🥖', color: '#D97706', keywords: [
        'pao', 'pão', 'pao frances', 'pão francês', 'pão de forma', 'pao de forma', 'pao de milho',
        'pão de milho', 'torrada', 'bisnaguinha', 'bolo', 'torta', 'croissant', 'donut', 'sonho',
        'brioche', 'baguete', 'pao de queijo', 'pão de queijo', 'broa', 'carolina', 'pudim',
        'pao de hamburguer', 'pão de hambúrguer', 'pao de hot dog', 'pão doce'
    ]},
    { id: 'mercearia', name: 'Mercearia & Despensa', icon: '🌾', color: '#8B5CF6', keywords: [
        'arroz', 'feijao', 'feijão', 'macarrao', 'macarrão', 'massa', 'espaguete', 'penne', 'parafuso',
        'molho de tomate', 'extrato de tomate', 'massa de tomate', 'oleo', 'óleo', 'azeite', 'azeite de oliva',
        'vinagre', 'sal', 'acucar', 'açúcar', 'cafe', 'café', 'cafe moido', 'café moído', 'cafe em grao',
        'capsula', 'cápsula', 'nespresso', 'dolce gusto', 'achocolatado', 'nescau', 'toddy', 'cacau',
        'farinha', 'farinha de trigo', 'farinha de milho', 'fuba', 'fubá', 'amido', 'maisena', 'maizena',
        'fermento', 'aveia', 'granola', 'cereal', 'mel', 'geleia', 'biscoito', 'biscoito de cacau',
        'bolacha', 'bolacha recheada', 'cookies', 'salgadinho', 'batata frita', 'snacks', 'amendoim',
        'amendoim com casca', 'castanha', 'nozes', 'azeitona', 'milho em lata', 'milho verde', 'ervilha',
        'seleta', 'sardinha em lata', 'atum em lata', 'maionese', 'ketchup', 'mostarda', 'shoyu',
        'pimenta', 'oregano', 'orégano', 'canela', 'pipoca', 'tempero pronto', 'caldo'
    ]},
    { id: 'bebidas', name: 'Bebidas', icon: '🥤', color: '#3B82F6', keywords: [
        'coca', 'coca zero', 'coca-cola', 'refrigerante', 'suco', 'nectar', 'néctar', 'agua', 'água',
        'agua de coco', 'água de coco', 'agua mineral', 'água mineral', 'cerveja', 'heineken', 'brahma',
        'skol', 'amstel', 'stella', 'chopp', 'vinho', 'espumante', 'vodka', 'gin', 'whisky', 'uísque',
        'rum', 'tequila', 'licor', 'energetico', 'energético', 'red bull', 'monster', 'cha', 'chá',
        'gatorade', 'isotonico', 'isotônico', 'tonica', 'tônica'
    ]},
    { id: 'limpeza', name: 'Limpeza', icon: '🧼', color: '#06B6D4', keywords: [
        'sabao', 'sabão', 'sabao em po', 'sabão em pó', 'sabao liquido', 'sabão líquido', 'amaciante',
        'detergente', 'desinfetante', 'agua sanitaria', 'água sanitária', 'cloro', 'candida', 'cândida',
        'lustra moveis', 'lustra móveis', 'limpa vidro', 'limpa piso', 'sapolio', 'sapólio', 'esponja',
        'bucha de pia', 'bucha', 'la de aco', 'lã de aço', 'bombril', 'saco de lixo', 'sacos de lixo',
        'papel toalha', 'guardanapo', 'rodo', 'vassoura', 'pano de chao', 'pano de chão', 'flanela',
        'vanish', 'alvejante', 'desengordurante', 'ajax', 'veja', 'pinho sol', 'removedor'
    ]},
    { id: 'higiene', name: 'Higiene & Cuidados', icon: '🧴', color: '#EC4899', keywords: [
        'shampoo', 'xampu', 'condicionador', 'sabonete', 'pasta de dente', 'creme dental', 'escova de dente',
        'fio dental', 'enxaguante', 'bucal', 'desodorante', 'perfume', 'colonia', 'colônia', 'hidratante',
        'protetor solar', 'papel higienico', 'papel higiênico', 'algodao', 'algodão', 'cotonete',
        'lamina', 'lâmina', 'gillette', 'barbeador', 'espuma de barbear', 'absorvente', 'fralda',
        'lenco umedecido', 'lenço umedecido', 'acetona', 'esmalte'
    ]},
    { id: 'congelados', name: 'Congelados', icon: '❄️', color: '#6366F1', keywords: [
        'congelado', 'congelada', 'sorvete', 'picole', 'picolé', 'pizza congelada', 'pizza',
        'lasanha congelada', 'lasanha', 'batata congelada', 'acai', 'açaí', 'gelo', 'nugget',
        'nuggets', 'empanado', 'hamburguer congelado'
    ]},
    { id: 'pet', name: 'Pet Shop', icon: '🐶', color: '#14B8A6', keywords: [
        'racao', 'ração', 'formula natural', 'pedigree', 'whiskas', 'golden', 'premier',
        'petisco de cachorro', 'petisco de gato', 'sache', 'sachê', 'areia de gato', 'areia higienica',
        'tapete higienico', 'osso para cachorro'
    ]},
    { id: 'outros', name: 'Outros', icon: '📦', color: '#6B7280', keywords: [] }
];

export class MarketManager {
    constructor() {
        this.filePath = path.resolve('./mercado_lista.json');
        this.items = [];
        this.lastSuggestions = [];
        this.load();
    }

    normalizeStr(str) {
        return (str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    detectCategory(itemName) {
        if (!itemName) return 'Outros';
        const norm = this.normalizeStr(itemName);

        // 1. Prioridade para correspondência exata ou de frase longa
        for (const cat of MARKET_CATEGORIES) {
            if (cat.id === 'outros') continue;
            for (const kw of cat.keywords) {
                const normKw = this.normalizeStr(kw);
                if (normKw.includes(' ') && norm.includes(normKw)) {
                    return cat.name;
                }
            }
        }

        // 2. Correspondência por palavras isoladas com limites de palavra
        for (const cat of MARKET_CATEGORIES) {
            if (cat.id === 'outros') continue;
            for (const kw of cat.keywords) {
                const normKw = this.normalizeStr(kw);
                // Regex para palavra inteira ou contida
                const regex = new RegExp(`(^|\\b|\\s)${normKw}(\\b|\\s|$)`, 'i');
                if (regex.test(norm)) {
                    return cat.name;
                }
            }
        }

        // 3. Fallback inteligente: se for bebida ou café ou comida comum
        if (norm.includes('cafe') || norm.includes('molho') || norm.includes('farinha')) return 'Mercearia & Despensa';
        if (norm.includes('suco') || norm.includes('refri')) return 'Bebidas';
        if (norm.includes('queijo') || norm.includes('iogurt')) return 'Frios & Laticínios';

        return 'Outros';
    }

    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
                if (Array.isArray(data)) {
                    let needsSave = false;
                    this.items = data.map(item => {
                        if (!item.category) {
                            item.category = this.detectCategory(item.name);
                            needsSave = true;
                        }
                        return item;
                    });
                    if (needsSave) {
                        this.save();
                    }
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

    getCategories() {
        return MARKET_CATEGORIES;
    }

    /**
     * Retorna a lista de itens ordenada por categorias de supermercado (corredores)
     * e por ordem alfabética dentro de cada categoria.
     */
    getOrderedItems() {
        const categoryOrder = MARKET_CATEGORIES.map(c => c.name);
        return [...this.items].sort((a, b) => {
            const catA = a.category || 'Outros';
            const catB = b.category || 'Outros';
            const indexA = categoryOrder.indexOf(catA);
            const indexB = categoryOrder.indexOf(catB);
            const orderA = indexA === -1 ? 999 : indexA;
            const orderB = indexB === -1 ? 999 : indexB;

            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name, 'pt-BR');
        });
    }

    getItemsGrouped() {
        const ordered = this.getOrderedItems();
        const groups = {};

        for (const cat of MARKET_CATEGORIES) {
            groups[cat.name] = {
                category: cat.name,
                icon: cat.icon,
                color: cat.color,
                items: []
            };
        }

        for (const item of ordered) {
            const catName = item.category || 'Outros';
            if (!groups[catName]) {
                groups[catName] = {
                    category: catName,
                    icon: '📦',
                    color: '#6B7280',
                    items: []
                };
            }
            groups[catName].items.push(item);
        }

        // Retorna apenas categorias que contêm ao menos 1 item
        return Object.values(groups).filter(g => g.items.length > 0);
    }

    addItem(nameOrNames, customCategory = null) {
        if (!nameOrNames) return [];

        const rawList = Array.isArray(nameOrNames)
            ? nameOrNames
            : String(nameOrNames).split(/[,;\n]+/);

        const added = [];
        for (let raw of rawList) {
            let clean = raw.trim();
            if (!clean) continue;

            // Suporte para categoria entre colchetes, ex: "Banana [Hortifrúti]"
            let itemCat = customCategory;
            const bracketMatch = clean.match(/\[(.*?)\]/);
            if (bracketMatch) {
                const foundCategoryName = bracketMatch[1].trim();
                const matchedCat = MARKET_CATEGORIES.find(c =>
                    this.normalizeStr(c.name).includes(this.normalizeStr(foundCategoryName))
                );
                if (matchedCat) {
                    itemCat = matchedCat.name;
                }
                clean = clean.replace(/\[(.*?)\]/, '').trim();
            }

            // Se ainda não tiver categoria ou se for 'auto', detecta automaticamente
            if (!itemCat || itemCat === 'auto') {
                itemCat = this.detectCategory(clean);
            }

            const item = {
                id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                name: clean.charAt(0).toUpperCase() + clean.slice(1),
                category: itemCat,
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

    updateItemCategory(id, newCategory) {
        const item = this.items.find(i => i.id === id);
        if (item) {
            item.category = newCategory || 'Outros';
            this.save();
            return item;
        }
        return null;
    }

    removeItem(identifier) {
        if (identifier === undefined || identifier === null) return null;

        const str = String(identifier).trim();
        const num = parseInt(str, 10);

        let removed = null;
        if (!isNaN(num) && num >= 1) {
            // Remoção pelo número de exibição (1-based) baseado na lista ordenada por categoria!
            const ordered = this.getOrderedItems();
            if (num <= ordered.length) {
                const targetItem = ordered[num - 1];
                const actualIndex = this.items.findIndex(i => i.id === targetItem.id);
                if (actualIndex !== -1) {
                    removed = this.items.splice(actualIndex, 1)[0];
                }
            }
        } else {
            // Remoção por busca de nome ou ID
            const lower = str.toLowerCase();
            const index = this.items.findIndex(i =>
                i.id === str ||
                i.name.toLowerCase() === lower ||
                i.name.toLowerCase().includes(lower)
            );
            if (index !== -1) {
                removed = this.items.splice(index, 1)[0];
            }
        }

        if (removed) {
            this.save();
        }
        return removed;
    }

    toggleItem(identifier) {
        if (identifier === undefined || identifier === null) return null;

        const str = String(identifier).trim();
        const num = parseInt(str, 10);

        let item = null;
        if (!isNaN(num) && num >= 1) {
            // Alternância pelo número de exibição (1-based)
            const ordered = this.getOrderedItems();
            if (num <= ordered.length) {
                const targetItem = ordered[num - 1];
                item = this.items.find(i => i.id === targetItem.id);
            }
        } else {
            // Alternância por busca de ID ou nome
            const lower = str.toLowerCase();
            item = this.items.find(i =>
                i.id === str ||
                i.name.toLowerCase() === lower ||
                i.name.toLowerCase().includes(lower)
            );
        }

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

        const currentNames = this.items.map(i => `${i.name} (${i.category || 'Geral'})`);
        const prompt = currentNames.length > 0
            ? `Você é um assistente de supermercado inteligente. A lista atual de compras tem os seguintes itens por seção:\n${currentNames.join(', ')}\n\nSugira de 4 a 6 itens adicionais comuns e complementares que combinem com essa lista ou que sejam essenciais em um supermercado brasileiro. Retorne APENAS uma lista simples de itens separados por vírgula (ex: Açúcar, Manteiga, Ovos, Detergente), sem explicações ou introdução.`
            : `Você é um assistente de supermercado inteligente. A lista de compras atual está vazia. Sugira de 4 a 6 itens essenciais de supermercado do dia a dia (alimentos ou higiene/limpeza). Retorne APENAS uma lista simples de itens separados por vírgula (ex: Arroz, Feijão, Leite, Café, Ovos), sem explicações ou introdução.`;

        try {
            const completion = await groqClient.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'openai/gpt-oss-120b',
                max_tokens: 120,
                temperature: 0.6
            });

            const text = completion.choices[0]?.message?.content || '';
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
        this.lastSuggestions = [];
        return added;
    }

    formatWhatsAppList(filterCategory = null) {
        if (this.items.length === 0) {
            return `🛒 *Sua lista de mercado está vazia!*\n\n💡 Use */mercado adicionar [produto]* para incluir itens na lista.`;
        }

        const groups = this.getItemsGrouped();

        // Se houver filtro de categoria (ex: /mercado hortifruti)
        let filteredGroups = groups;
        if (filterCategory) {
            const normFilter = this.normalizeStr(filterCategory);
            filteredGroups = groups.filter(g =>
                this.normalizeStr(g.category).includes(normFilter)
            );

            if (filteredGroups.length === 0) {
                const available = groups.map(g => `${g.icon} ${g.category}`).join('\n• ');
                return `❌ Nenhuma categoria encontrada para "*${filterCategory}*".\n\nCategorias com produtos na sua lista:\n• ${available}`;
            }
        }

        const totalItems = this.items.length;
        const totalChecked = this.items.filter(i => i.checked).length;
        const percent = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;

        let msg = `🛒 *LISTA DE MERCADO* (${totalItems} ${totalItems === 1 ? 'item' : 'itens'})\n`;
        msg += `Organizada por seções do supermercado:\n\n`;

        // Mantém a numeração global contínua para os comandos de remoção e marcação
        const ordered = this.getOrderedItems();

        for (const group of filteredGroups) {
            const groupTotal = group.items.length;
            const groupChecked = group.items.filter(i => i.checked).length;
            const groupBadge = groupChecked > 0 ? ` (${groupChecked}/${groupTotal})` : ` (${groupTotal})`;

            msg += `${group.icon} *${group.category.toUpperCase()}*${groupBadge}\n`;

            for (const item of group.items) {
                // Encontra o índice global (1-based) para manter consistência nos comandos
                const globalIndex = ordered.findIndex(i => i.id === item.id) + 1;
                const mark = item.checked ? '☑️' : '◻️';
                const nameText = item.checked ? `~${item.name}~` : item.name;

                msg += `${mark} *${globalIndex}.* ${nameText}\n`;
            }
            msg += `\n`;
        }

        msg += `📊 *Progresso:* ${totalChecked}/${totalItems} comprados (${percent}%)\n`;
        msg += `\n💡 *Comandos úteis:*\n`;
        msg += `• */mercado enquete*          👉 Transforma em Enquete Checklist interativa!\n`;
        msg += `• */mercado marcar [número]*  👉 Riscar item comprado na lista de texto\n`;
        msg += `• */mercado adicionar [item]* 👉 Adicionar produto\n`;
        msg += `• */mercado remover [número]* 👉 Excluir da lista\n`;
        msg += `• */mercado sugestão*         👉 Sugestões inteligentes de IA`;

        return msg;
    }
}
