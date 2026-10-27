# 🤖 Prompt de Inicialização: Assistente Pessoal WhatsApp (Transcritor & Lista de Mercado com IA)

> **Como usar este arquivo:**  
> Copie e cole todo o conteúdo abaixo diretamente no chat do seu **Antigravity**.  
> O Antigravity cuidará de clonar o repositório, instalar as dependências, configurar o ambiente e guiar você no passo a passo para conectar o seu WhatsApp!

---

Olá Antigravity! Quero configurar e rodar o meu próprio **Assistente Pessoal do WhatsApp** na minha máquina, baseado no projeto open-source do repositório público:  
👉 **`https://github.com/giovanipelissoni/Whatsapp-transcritor`**

Por favor, assuma o papel de desenvolvedor assistente e execute o passo a passo completo para deixar o bot funcionando perfeitamente no meu computador.

---

## 🎯 Objetivo do Projeto
O **WhatsApp Transcritor & Assistente** é uma ferramenta pessoal desenvolvida em Node.js com uma interface Web moderna (`http://localhost:3000`) e integração direta com o WhatsApp via Baileys e IA da Groq Cloud.

### 🌟 Principais Recursos:
1. **🎙️ Transcrição de Áudio com IA (Whisper Large v3 - Groq):**
   - Transcrição automática de áudios recebidos ou enviados em conversas privadas.
   - Comando `/transcrever` para transcrever sob demanda citando/respondendo qualquer áudio (funciona em conversas privadas e grupos).
   - Reações com emojis no WhatsApp: ⏳ (processando), ✅ (concluído), ❌ (erro).
   - Proteção anti-replay com filtro de idade (`> 180s`) e cache de IDs para evitar re-transcrições de mensagens antigas ao reconectar.

2. **🛒 Lista de Mercado Inteligente & Dashboard:**
   - Painel Web em tempo real (`http://localhost:3000`) com aba exclusiva para lista de compras (adicionar, riscar item comprado, excluir, sugestões automáticas).
   - Comandos diretamente no WhatsApp:
     - `/mercado`: Mostra a lista completa de compras organizada por seções do mercado (Hortifrúti, Carnes, Frios, Limpeza...).
     - `/mercado <seção>`: Filtra itens de uma seção específica (ex: `/mercado hortifruti`).
     - `/mercado marcar <item ou número>`: Marca ou desmarca o item como comprado enquanto está no mercado.
     - `/mercado adicionar <itens>`: Adiciona um ou mais itens com categorização automática inteligente (ex: `/mercado adicionar Leite, Ovos, Café`).
     - `/mercado remover <item ou número>`: Remove um item da lista (ex: `/mercado remover 2` ou `/mercado remover Leite`).
     - `/mercado limpar`: Esvazia a lista de compras.
     - `/mercado sugestão`: A IA analisa seus itens atuais e sugere produtos complementares que possam estar faltando.
     - `/mercado adicionar sugestão`: Adiciona automaticamente à sua lista os itens sugeridos pela IA.
     - `/comandos`: Exibe todos os comandos disponíveis no WhatsApp.

3. **🛡️ Segurança do Proprietário:**
   - Todos os comandos do bot (`/mercado`, `/comandos`, `/transcrever`) são restritos e só executam quando enviados por **você mesmo** (`fromMe === true`), impedindo que terceiros em grupos ou chats manipulem sua lista ou usem comandos sem autorização.

4. **🌐 Painel Web Interativo (`http://localhost:3000`):**
   - Conexão via **QR Code** ou via **Código de Pareamento de 8 dígitos** por número de telefone.
   - Feed de transcrições em tempo real com botão de copiar em 1 clique.
   - Gerenciamento completo da lista de mercado.
   - Console de logs em tempo real via Server-Sent Events (SSE).

---

## 🛠️ Passo a Passo para o Antigravity Executar:

### Passo 1: Clonar o Repositório
Clone o repositório público na pasta atual de trabalho:
```bash
git clone https://github.com/giovanipelissoni/Whatsapp-transcritor.git .
```
*(Se a pasta já tiver arquivos, clone em uma subpasta ou verifique os arquivos).*

### Passo 2: Instalar Dependências
Execute a instalação dos pacotes necessários:
```bash
npm install
```

### Passo 3: Configurar as Variáveis de Ambiente (`.env`)
1. Crie o arquivo `.env` na raiz do projeto a partir do `.env.example`:
```env
PORT=3000
GROQ_API_KEY=sua_chave_aqui
```
2. **Atenção:** Você precisará de uma chave de API gratuita da **Groq** (usada para a transcrição via Whisper Large v3 e para as sugestões da lista de compras via modelo open-source rápido).  
👉 Obtenha sua chave gratuita em segundos aqui: **https://console.groq.com/keys**  
*(Se eu ainda não tiver a chave, me avise para que eu gere e te envie ou coloque no `.env`).*

### Passo 4: Iniciar o Servidor
Inicie a aplicação:
```bash
node server.js
```
Ou no Windows, através do script:
```cmd
iniciar.bat
```

### Passo 5: Conectar ao WhatsApp
1. Abra o navegador em: **`http://localhost:3000`**
2. Escolha como prefere conectar:
   - **QR Code:** Aponte a câmera do WhatsApp no seu celular em *Aparelhos Conectados > Conectar Aparelho*.
   - **Código de 8 Dígitos:** Digite seu número com DDI e DDD (ex: `5511999998888`), clique em "Gerar Código" e insira a sequência de 8 dígitos que aparecerá na notificação do seu WhatsApp no celular.
3. Assim que o painel exibir **"Conectado"**, o assistente já estará 100% ativo e pronto para uso!

---

Por favor, comece verificando o ambiente, clonando o repositório e me orientando no que precisar!
