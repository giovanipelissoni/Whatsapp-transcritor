# 🎙️ WhatsApp Transcritor AI - Painel Web

Ferramenta local com **Dashboard Web** interativo para transcrever áudios do WhatsApp automaticamente usando **Node.js**, **Baileys**, **Whisper Large v3 (via Groq Cloud)** e interface web em tempo real.

---

## ✨ Novidades da Versão 2.0 (Interface Web)

* 🌐 **Painel Web Interativo (`http://localhost:3000`)**:
  * **Ligar e Desligar:** Inicie e pause o transcritor a qualquer momento com um clique.
  * **QR Code na Tela:** Visualize o QR Code do WhatsApp diretamente no navegador com atualização automática para conectar ou reconectar seu aparelho.
  * **Status da Conexão:** Veja o nome e telefone do WhatsApp conectado em tempo real.
  * **Transcrições ao Vivo:** Feed em tempo real de todos os áudios recebidos e transcritos, com botão para copiar o texto com 1 clique.
  * **Controles Rápidos:**
    * Ativar/Desativar transcrição dos próprios áudios enviados.
    * Configurar comportamento em grupos (Sob comando `/transcrever`, Sempre ativo, ou Desativado).
    * Botão para pausar temporariamente as transcrições sem desconectar o WhatsApp.
    * Botão para desconectar sessão e trocar de conta.
  * **🛡️ Whitelist de Números Autorizados:**
    * Cadastre números de familiares e pessoas de confiança (ex: Esposa) pelo Painel Web.
    * Permite que contatos autorizados executem comandos (`/mercado`, `/comandos`, `/transcrever`) na conversa privada com você.
  * **Console de Logs:** Visualize os eventos e mensagens internas do sistema.

---

## 🚀 Como Funciona a Transcrição

* **Comando Universal `/transcrever` (Privado e Grupos):**
  * Responda (cite) qualquer áudio recebido ou enviado com a mensagem `/transcrever` para obter a transcrição sob demanda.
* **No Privado (DMs):**
  * Qualquer áudio recebido é transcrito automaticamente.
  * Qualquer áudio enviado por você é transcrito automaticamente (configurável no painel).
* **Em Grupos:**
  * Padrão silencioso: responda (cite) qualquer áudio com a mensagem `/transcrever`.
  * Pode ser configurado pelo painel para transcrever todos os áudios automaticamente ou ficar desativado.
* **Reações no WhatsApp:**
  * ⏳ : Processando áudio / enviando para a Groq Whisper.
  * ✅ : Transcrição enviada com sucesso.
  * ❌ : Falha no download ou na transcrição.

---

## 🛒 Lista de Mercado por Categorias & Assistente de Compras

Você pode gerenciar sua lista de compras tanto pelo WhatsApp quanto pelo Painel Web em tempo real, agora organizada pelas seções do supermercado (Hortifrúti, Carnes & Açougue, Frios & Laticínios, Padaria, Mercearia, Bebidas, Limpeza, Higiene, Congelados, Pet Shop)!

* **/comandos**: Exibe todos os comandos do assistente e suas descrições.
* **/mercado**: Exibe a lista completa de compras agrupada pelas seções do supermercado com barra de progresso.
* **/mercado [seção]**: Filtra apenas os itens de uma seção específica (ex: `/mercado hortifruti`, `/mercado limpeza`).
* **/mercado marcar [número ou nome]**: Marca ou desmarca o produto como comprado enquanto você faz compras no mercado.
* **/mercado adicionar [produto]**: Adiciona produtos com categorização automática inteligente (ex: `/mercado adicionar Banana, Peito de frango, Sabão`).
* **/mercado remover [número ou nome]**: Remove um produto específico da lista.
* **/mercado sugestão**: Sugere novos produtos usando IA com base na sua lista atual.
* **/mercado adicionar sugestão**: Adiciona os itens sugeridos diretamente à lista de compras.
* **/mercado limpar**: Limpa toda a lista de mercado.

---

## 📋 Pré-requisitos

1. **Chave de API Gratuita da Groq:**
   * Acesse [console.groq.com/keys](https://console.groq.com/keys)
   * Crie uma chave e insira no arquivo `.env`:
     ```env
     GROQ_API_KEY=gsk_suaChaveAqui...
     PORT=3000
     ```

---

## ▶️ Como Rodar

Basta dar dois cliques no arquivo:
```
iniciar.bat
```
Ou rodar pelo terminal:
```bash
npm start
```

O navegador abrirá automaticamente em **`http://localhost:3000`** com o painel de controle!
