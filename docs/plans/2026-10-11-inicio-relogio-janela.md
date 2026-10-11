# Início, relógio flutuante, canvas e janela sem moldura — Implementation Plan

> **For Claude:** executar tarefa por tarefa nesta sessão. Commit só quando o dono pedir (preferência dele); no fim, apagar builds antigos, gerar o instalador, desinstalar o antigo e instalar o novo.

**Goal:** fechar as arestas do Início (recorte de toda foto, mostrar/esconder blocos pelo Personalizar), criar o relógio flutuante com atalho, corrigir o canvas (rótulo fantasma, linha, borracha lenta) e trocar a barra de título do Windows por botões embutidos na faixa de abas.

**Architecture:** regras puras em `lib/` (testadas com `node --test`), componentes React finos em cima delas. O recorte usa o modelo que a capa já tinha (`x`, `y` em % e `zoom`, com `object-fit: cover`), agora num popup com a caixa na proporção do lugar onde a foto vai ficar. A janela vira `decorations: false` e os controles chamam a API de janela do Tauri.

**Tech Stack:** React 18 + Vite + Tailwind, Tauri 2 (`@tauri-apps/api/window`), Django/DRF (validação do `home_layout`).

---

## Diagnóstico (o que está errado hoje)

| Queixa | Causa no código |
|---|---|
| Não dá para recortar fundo nem relógio | `OpcoesDeFoto` só recebe `onRecortar` na capa; o fundo é `background-image` com `cover center`, que ignora `x/y/zoom`. |
| Importar foto não pergunta o enquadramento | Só a capa abre o recorte, e no lugar (`Recortar` dentro de `Capa.jsx`), não num popup. |
| Bloco escondido não volta | O único caminho é o botão "Mostrar N blocos escondidos" no pé da grade, que some de vista; o Personalizar não lista os blocos. |
| Retângulo/elipse nascem com "Retângulo"/"Elipse" escritos | `GraphNode` usa `node.text \|\| preset.label` como texto de exemplo; no canvas essas formas nem aceitam texto (`permiteTexto`). |
| "Linha" não cria linha | `line_shape` é desenhada como uma barra (`shape: 'bar'`) do tamanho do retângulo arrastado, com mínimo de 20 px: vira uma pílula grossa. |
| Borracha engasga | Cada `pointermove` faz `setPointer` (re-render do editor inteiro, com todos os nós) e `update` do documento. |
| Barra de título do Windows | `tauri.conf.json` com a moldura padrão; nada no app sabe minimizar/maximizar/fechar. |

## Tarefas

### Task 1: mostrar/esconder blocos como regra pura
- Modify: `frontend/src/lib/inicio.js` — `alternarBloco(blocos, id, visivel)`: esconder marca `visivel: false`; mostrar tira a posição (o app recoloca embaixo de tudo, onde se vê que chegou).
- Modify: `frontend/src/components/inicio/GradeDoInicio.jsx` — `esconder`/`mostrar` passam a usar a regra.
- Test: `frontend/src/lib/inicio.test.mjs` — esconder mantém posição; mostrar volta sem posição e visível.

### Task 2: Personalizar com "Blocos" e "Aparência"
- Modify: `frontend/src/components/inicio/PersonalizarInicio.jsx` — linha **Blocos** com um interruptor por bloco (nome + dica); linha **Aparência** com opacidade e títulos (o que hoje está em "Blocos").
- Modify: `frontend/src/pages/Home.jsx` — `onAlternarBloco`.

### Task 3: recorte em popup para capa, fundo e relógio
- Create: `frontend/src/components/inicio/RecortarFoto.jsx` — modal com a caixa na proporção do destino; arrastar move, controle e roda dão zoom, setas movem, Enter salva, Esc cancela.
- Modify: `frontend/src/lib/inicio.js` — `proporcaoDoDestino(medidas)`, `recorteAoMover(...)` (conta pura do arraste, testada).
- Modify: `frontend/src/components/inicio/Capa.jsx` — sai o recorte no lugar; `FotoDaCapa` ganha `escurecer`; raiz marcada `data-capa`.
- Modify: `frontend/src/pages/Home.jsx` — toda foto nova (computador, arquivos, arrastada na capa ou no Personalizar) abre o recorte; "Recortar" vale para os três; o fundo vira uma camada fixa medida sobre a área da página, que respeita `x/y/zoom`.
- Modify: `frontend/src/components/inicio/PersonalizarInicio.jsx` — quadro da foto em uso com "Recortar" nos três.
- Test: `inicio.test.mjs` — proporção e conta do arraste.

### Task 4: relógio flutuante (Alt+R)
- Create: `frontend/src/components/layout/RelogioFlutuante.jsx` — o mesmo `BlocoRelogio` (com o fundo e o recorte do Início) numa janelinha por cima do app; arrasta por qualquer ponto livre, canto redimensiona, fica dentro da janela, lembra posição/tamanho/aberto; tempo de estudo no canto superior direito.
- Modify: `frontend/src/lib/inicio.js` — `prenderNaTela(ret, tela)` (testada).
- Modify: `frontend/src/components/layout/AppLayout.jsx` — monta o relógio; Alt+R.
- Modify: `frontend/src/pages/Home.jsx` — botão "Destacar relógio" no bloco.
- Modify: `frontend/src/lib/atalhos.js` — Alt+R na lista.

### Task 5: canvas
- Modify: `frontend/src/components/editors/GraphNode.jsx` — prop `rotuloDeExemplo`; `line_shape` desenha uma linha de ponta a ponta (com alvo de clique largo).
- Modify: `frontend/src/lib/graph.js` — `linhaEntre(origem, fim)` → `{ x, y, w, h, dir }` (testada).
- Modify: `frontend/src/components/editors/GraphEditor.jsx` — sem rótulo de exemplo nas formas do canvas; prévia e criação da linha pela regra; redimensionar linha sem mínimo de 20 px; borracha num `requestAnimationFrame` (um apagar por quadro, interpolando o caminho) e prévia do círculo direto no DOM.

### Task 6: janela sem moldura
- Modify: `frontend/src-tauri/tauri.conf.json` — `decorations: false`.
- Modify: `frontend/src-tauri/capabilities/default.json` — `start-dragging`, `minimize`, `toggle-maximize`, `internal-toggle-maximize`, `close`, `is-maximized`.
- Create: `frontend/src/components/layout/ControlesDaJanela.jsx` — minimizar, maximizar/restaurar (ícone acompanha o estado), fechar (vermelho no hover), no padrão do Windows 11.
- Modify: `AppLayout.jsx` (faixa de abas e barra do celular com área de arrastar + controles), `Sidebar.jsx` (cabeçalho arrastável), `lib/desktop.js` (janela destacada também sem moldura).
- Verificar no app instalado: arrastar, duplo clique maximiza, bordas redimensionam (`WM_NCHITTEST`), botões funcionam.

### Task 7: conferência
- `npm test`, `npx eslint`, `python manage.py test`; textos novos em `locales/en-US.js`.
- Navegador (Edge headless): Personalizar, recorte, relógio flutuante, canvas.
- Apagar builds antigos → `build-desktop.ps1` → desinstalar → apagar pasta → instalar → abrir.
