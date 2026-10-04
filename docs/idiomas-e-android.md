# Idiomas (pt-BR e en-US) e Android

## Como o app troca de idioma

O texto em português é a própria chave: `t('Salvar')` mostra "Salvar" em pt-BR e
procura "Salvar" no dicionário inglês (`frontend/src/locales/en-US.js`).

- `t('{n} itens', { n })` interpola `{variavel}`. As variáveis têm de ser as
  mesmas nos dois lados; o teste confere.
- Plural: uma chave por forma, `n === 1 ? t('1 item') : t('{n} itens', { n })`.
- O mesmo texto pedindo duas traduções ("Média" é *Medium* na prioridade e
  *Average* no resumo da coluna): `t('Média@@agregação')`. O português mostra só
  "Média", e o dicionário inglês guarda a chave inteira.
- Datas e dias da semana: `localeDatas` (date-fns) e os formatos em `t("d 'de'
  MMM")`. Números: `Intl` com o `idioma`.
- O idioma vem do que a pessoa escolheu em Configurações, depois do idioma do
  sistema, depois do português. Trocar NÃO recarrega o app: `trocarIdioma`
  muda o `idioma`, avisa com o evento `notefy:idioma`, e o `App` remonta as
  telas embaixo da sessão (mesma rota, mesmas abas).
- Por isso texto guardado em constante de módulo é getter:
  `{ get label() { return t('Pasta') } }`, lido de novo a cada desenho. Uma
  lista ou constante solta com `t()` vira função. O teste "constante de módulo
  acompanha a troca de idioma" (`i18n.test.mjs`) segura isso.

### Três testes seguram isso

| Teste | O que pega |
|---|---|
| `lib/i18n.test.mjs` | todo `t('...')` do código tem tradução, sem variável trocada |
| `lib/textoSolto.test.mjs` | texto acentuado escrito no código **fora** de `t()` |
| `components/ai/acoes.en.test.mjs` | os pedidos em inglês ao Laviel ("make a mind map about X") |

O `textoSolto` só vê texto com acento. Palavra sem acento solta ("Sim", "Novo")
quem revisa a tela precisa ver.

### O que vem do servidor

O Django responde em português, e o app traduz **no cliente**, em
`traduzirMensagem` (usada por `extractError`): a mensagem exata, ou um padrão
com `{variavel}`. O app manda `Accept-Language`, e o `LocaleMiddleware` faz o
Django/DRF responderem em inglês nas mensagens deles. Quando o servidor **gera**
um texto que fica gravado (o "(cópia)" de uma duplicata, o quadro padrão de uma
conta nova, o cabeçalho do PDF), quem escolhe o idioma é `core/idioma.py`.

O Laviel responde em inglês quando o app está em inglês (`ai/views.py`), menos
na tarefa de traduzir, onde vale o idioma que a pessoa escolheu.

### Adicionar um idioma

1. Entrada em `IDIOMAS` (`lib/i18n.js`) e um `locales/xx-XX.js` novo no
   `DICIONARIOS`.
2. Locale do date-fns em `localeDatas`.
3. Detector de pedidos do Laviel, se o idioma tiver verbos diferentes
   (`components/ai/acoes.en.js` é o modelo).

## Android

O celular **não roda o Django**: o sidecar do desktop é um `.exe`. Enquanto o
app não tiver banco local (ver o plano de nuvem e sincronização), o APK é um
cliente do servidor na nuvem, com login e internet.

### O que já está pronto no repositório

- `src-tauri/tauri.android.conf.json`: tira o sidecar e o `WebView2Loader.dll`
  do pacote do Android e usa `npm run build:android`.
- `src-tauri/capabilities/`: a permissão de executar o backend e a de abrir
  janelas ficam só no desktop; o Android tem `mobile.json`.
- `src-tauri/src/lib.rs` e `Cargo.toml`: o plugin `shell`, o sidecar e o "Salvar
  como" são `cfg(desktop)`. No Android, exportar avisa que ainda não funciona.
- `.env.android`: o endereço do servidor (**trocar** antes de gerar o APK).
- `vite.config.js`: `TAURI_DEV_HOST`, para `tauri android dev` alcançar o Vite
  do PC. Em dev o proxy do Vite leva `/api` até o Django do PC.

### O que falta, e precisa de ferramenta que esta máquina não tem

- JDK 17 (há o 1.8), Android SDK com NDK, e os alvos do Rust
  (`rustup target add aarch64-linux-android armv7-linux-androideabi
  i686-linux-android x86_64-linux-android`).
- `npx tauri android init`, que gera `src-tauri/gen/android`.
- Teste num aparelho ou emulador Android. O toque foi conferido no Chrome com
  toque de verdade emulado (375 px), não num celular.

## Toque

Vale para o Android e para qualquer tela sem mouse.

| No mouse | No toque |
|---|---|
| Botão direito | Pressionar e segurar (`lib/toqueLongo.js`, com teste) |
| Duplo clique | Toque duplo; na planilha, tocar de novo na célula marcada também edita |
| Ctrl+clique para marcar vários | O toque longo marca o item; com a seleção aberta, cada toque soma ou tira. O X da barra sai do modo |
| Controle que aparece no hover | Sempre visível sem mouse (`index.css`) |
| Ctrl+Z no quadro | Desfazer e refazer no canto, junto do zoom |
| Ctrl+J | Botão do Laviel ao lado do sino |
| Ctrl+Enter na busca | "Perguntar ao Laviel" ao lado dos resultados |
| Arrastar cartão, bloco ou item | "Mover para..." no menu do toque longo; o bloco da nota tem menu na alça |
| Atalhos da nota (`/`, `[] `, Ctrl+Shift+9) | Os mesmos `/` e `[] ` no teclado virtual, ou a barra de funções, que rola de lado |

No celular, o quadro (canvas e diagrama) guarda a paleta numa gaveta, abre as
propriedades numa folha embaixo e só escuta o primeiro dedo. A conversa do
Laviel cobre a tela.

### O que ainda não funciona no celular

- **Exportar** (PDF, .zip, planilha) não funciona: precisa do compartilhamento
  nativo do Android (plugin em Kotlin).
- **Abrir em nova janela** some do menu: o celular tem uma janela só.
- **Arrastar e soltar** do HTML5 não tem garantia no toque. Tudo o que ele faz
  tem outro caminho pelo menu, menos reordenar colunas da planilha e abas.
- **Pinça** não dá zoom no quadro; os botões no canto dão.
- **Planilha**: marcar várias células arrastando e copiar células (Ctrl+C) não
  existem no toque. O dedo que arrasta rola a grade.
