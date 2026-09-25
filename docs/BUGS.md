# Bugs e pendências — sessão de 22/08/2026

Relato do usuário + causas verificadas no código.

**Status: todos corrigidos e validados** (frontend 162 testes, backend 184,
lint e build limpos, verificação ao vivo no navegador). As decisões pendentes
foram resolvidas assim: modificador NUNCA navega (DECISÃO-1), planilha com o
pacote 1–5 (DECISÃO-2), continuar escreve a abertura sozinho (DECISÃO-3).

| Bug | Correção | Prova ao vivo |
|---|---|---|
| IA-1 | helper `executar.js` compartilhado; menu passou a somar | canvas 5 → 7 nós, antigos intactos |
| IA-2/IA-5 | família `coloc`, ordem invertida, fuzzy no verbo | 10 frases do log viram ação |
| IA-3 | `removerThink()` dentro de `limparMarkdown` | mock com `<think>` → bolha limpa |
| IA-4 | prompt de `nota.continuar` não recusa mais | 184 testes backend OK |
| PLAN-1 | `lib/celulas.js` + grade com seleção/clipboard | arrasto 2×2, Delete no intervalo, Shift+seta |
| UI-1 | Shift/Ctrl só selecionam, em todas as telas | shift na sidebar: 1 aba antes, 1 depois |
| UI-2 | seleção muda cor, não o peso da fonte | — |

---

## IA-1 · Menu de contexto do editor SUBSTITUI o documento (canvas/diagrama)

**Sintoma.** "Gerar a partir do conteúdo" / "Gerar a partir de uma descrição..."
no botão direito apagam o que já estava desenhado. O chat, ao contrário, soma
("gere um mapa mental sobre pizza" → "Quadro criado", conteúdo preservado).

**Causa.** Duas portas para a mesma função com contratos diferentes:

- Chat (`AssistentePanel.jsx`): busca o doc atual → preview da IA →
  `mergeDocumento()` (append por padrão) → PATCH. ✅ soma.
- Editor (`useAcoesIA.jsx`, linhas 129 e 133): `executar(task, { apply:'replace' })`
  direto — o backend grava por cima do documento inteiro. ❌ substitui.

**Correção proposta.** Extrair helper único `executarNoDocumento(documentId,
kind, task, input, { substituir })`: busca atual → preview → merge → patch →
dispara `notefy:saved`. O painel e o `useAcoesIA` passam a usá-lo.
"Gerar a partir de..." vira APPEND (como o chat). Substituição explícita só no
caso "regenerar" (que já é falado no chat).

**Esforço:** médio. **Testes:** merge continua coberto; adicionar teste do helper
com mock de runIA.

---

## IA-2 · Dicionário de ações: stems errados, ordem de frase e typos

**Sintomas (log real).**
- `"coloca no texto um resumo..."` não virou ação (foi pro chat).
- `"faça na nota um resumo de X"` não virou ação (foi pro chat).
- Typos: `"faca"`, `"colouqe"` etc.

**Causa verificada (`components/ai/acoes.js`).**
1. VERBOS tem `coloqu?(ar|e|a|o)` mas **não tem a família `coloc`** —
   "coloca"/"coloquem" não casam (q ≠ c).
2. O padrão de nota exige **verbo + objeto + "na nota"**. Na fala do usuário o
   alvo vem ANTES do objeto: "faça **na nota** um resumo de X".
3. Só acentos são normalizados; nenhum tolerância a erro de digitação.

**Correção proposta.**
- Adicionar `coloc(?:ar|a|e|o|ando)` ao VERBOS (+ revisar os outros stems).
- Aceitar as duas ordens: "verbo + objeto + na nota" e "verbo + na nota + objeto".
- **Fuzzy só no verbo**: tokenizar o primeiro verbo da frase e casar contra a
  lista com distância de edição ≤ 2 (transposição conta 1 → "colouqe"=coloque,
  "geraer"=gerar, "criva"=cria). O resto da frase continua exato, para não
  criar falsos positivos.

**Esforço:** pequeno/médio. **Testes:** ampliar `acoes.test.mjs` com os casos do
log + matriz de typos.

---

## IA-3 · Tag `<think>` aparece no chat

**Sintoma.** Respostas começam com `<think></think>` visível.

**Causa.** Modelos de raciocínio devolvem o bloco `<think>...</think>` dentro do
próprio content. Nem o backend (`tarefas.py`) nem `limparMarkdown()`
(`lib/utils.js`) removem a tag. No streaming ela também pisca parcial.

**Correção proposta.** Função `removerThink(texto)`: remove blocos completos
(multilinha) E tag de abertura órfã (durante o stream). Aplicar em:
1. render das mensagens do chat (AssistentePanel);
2. antes de gravar texto na nota (`mergeNotaTexto` / tarefas nota.*);
3. sanitização geral em `ai.js`.

**Esforço:** pequeno. **Testes:** unitário de `removerThink` (bloco completo,
órfão, sem tag).

---

## IA-4 · "Continuar" se recusa quando a nota está quase vazia

**Sintoma.** Nota com só "aa" → `/continuar` devolve sermão ("não vou inventar...")
em vez de continuar. Usuário percebe escopo inconsistente: resumir/gerar aceitam
ir buscar conhecimento geral, continuar não.

**Causa.** Prompt de `nota.continuar` (`tarefas.py:126`) diz apenas "continue o
texto fornecido". Com material mínimo, o modelo interpreta como impossível.

**Correção proposta.** Reescrever o prompt: "Continue o texto. Se o material
existente for mínimo ou sem assunto definido, escreva uma ABERTURA sólida sobre
o tema indicado pelo usuário (input/conversa); nunca recuse por material curto —
comece você o texto." O frontend, quando o usuário fala "continua sobre X",
passa X como input da tarefa (hoje descarta).

**Decisão do usuário necessária:** concorda que a IA escreva a abertura sozinha
nesses casos? Alternativa: manter recusa curta (1 frase), mas hoje ela é longa.

**Esforço:** pequeno.

---

## IA-5 · Ações de nota/planilha não disparam nos formatos que o usuário fala

(Subset do IA-2, listado à parte porque envolve o fluxo todo.)

- "escreve/adiciona texto na nota" funciona, mas variações com o alvo no meio
  da frase ("faça na nota um resumo") caem no chat comum.
- Quando caem no chat comum, a resposta chega com `<think>` (IA-3) e não grava
  nada — o usuário lê um texto bonito que some. Sensação de "não dá pra gerar
  conteúdo na nota pelo chat".

**Correção proposta.** Cobertura dos padrões (IA-2) + quando `nota.texto` roda,
mostrar rótulo claro ("Texto adicionado à nota") e abrir a nota atualizada
(já acontece via `notefy:saved`; conferir foco).

---

## PLAN-1 · Planilha sem seleção múltipla nem copiar/colar de células

**Sintoma.** Não dá para selecionar várias células, copiar uma célula/bloco para
outro lugar — só o valor solto.

**Causa.** `SpreadsheetEditor.jsx` só tem seleção de COLUNA (`selectedColumn`)
e edição célula-a-célula. Não existe estado de range, nem handlers de
clipboard.

**Escopo proposto (confirmar antes).**
1. Seleção retangular: clique define célula ativa; shift+clique estende range;
   arrastar estende (se der).
2. Ctrl+C: copia o range como TSV (colável no Excel/Sheets).
3. Ctrl+V: cola TSV a partir da célula ativa (recorta no fim da grade; aceita
   colar DE FORA, ex. do Excel).
4. Delete: limpa valores do range.
5. Fórmulas continuam recalculando após colar.

**Fora do escopo (por enquanto):** recortar arrastando, colar formatação,
mesclar células.

**Esforço:** grande (maior item da lista). **Testes:** util de parse/build TSV +
cola com clipping.

---

## UI-1 · Shift+clique nas listas: comportamento quebrado por tela

**Causas verificadas, tela a tela:**

| Tela | Estado |
|---|---|
| Home | `handleItemClick` (Home.jsx:172) **não tem branch de Shift** — cai no else e só marca 1 |
| Sidebar (árvore) | `handleSelection` (CategoryTree.jsx:100) só faz `preventDefault` no **Ctrl**; no Shift o `<a>` do NavLink navega pelo default do browser → **abre nova aba/janela** |
| Categoria (lista de pastas) | `handleFolderClick` (CategoryDetail.jsx:113) tem Shift ok, mas é implementação própria duplicada (sem usar `useMultiSelect`) |
| Pasta / Busca / Lixeira / Arquivos | usam `useMultiSelect.handleClick` corretamente |

**Correção proposta.**
1. Todo clique com Shift/Ctrl nos cartões e links chama `preventDefault()` —
   **nenhum modificador navega** (ver DECISÃO-1).
2. Home ganha o branch de Shift (range pela âncora) — idealmente migrando Home/
   CategoryDetail/Sidebar para o `useMultiSelect` existente em vez de manter 3
   implementações.
3. Sidebar: decidir se Shift vale lá (árvore aninhada — range ambíguo). Sugestão:
   na sidebar só Ctrl marca; Shift ignora SEM abrir aba.

**Depende de:** DECISÃO-1.

---

## UI-2 · Highlight "mais gordo" no Ctrl+clique

**Sintoma.** Ao marcar pasta com Ctrl+clique, a palavra fica negrita em vez de
só mudar de cor.

**Causa verificada.** Não é seleção de texto: o estilo selecionado do NavLink
(CategoryTree.jsx:182) aplica **`font-medium`** junto com a cor — a fonte fica
mais larga. Além disso `::selection` global (index.css:47) pinta o fundo, mas o
incômodo relatado é o peso.

**Correção proposta.** Estilo de selecionado muda só cor/fundo (ex. `text-accent-700
bg-accent-500/10`), sem alterar peso da fonte. Vale para sidebar e cartões.

**Esforço:** trivial.

---

## DECISÕES pendentes do usuário

1. **DECISÃO-1 — Matar "abrir em nova aba" com modificadores.** Usuário sinalizou
   que quer desabilitar (app desktop), mas pediu para não codificar ainda.
   Proposta: Shift/Ctrl+clique em QUALQUER item de lista/sidebar só seleciona,
   nunca navega nem abre aba. Confirmar.
2. **DECISÃO-2 — Escopo da planilha**: o pacote 1–5 do PLAN-1 está OK? Falta algo
   (ex.: mover células arrastando)?
3. **DECISÃO-3 — Continuar com nota vazia**: IA escreve abertura sozinha (proposta)
   ou recusa curta?

## Ordem sugerida de execução

1. IA-3 (think) — trivial, melhora tudo que depende de resposta de texto.
2. IA-2/IA-5 (stems + ordem + fuzzy) — pequeno, fecha as reclamações do log.
3. IA-4 (prompt continuar) — pequeno, após DECISÃO-3.
4. IA-1 (helper unificado, acaba com substituição acidental) — médio.
5. UI-1/UI-2 (shift/ctrl + font-medium) — após DECISÃO-1; médio.
6. PLAN-1 (planilha) — maior, deixar por último, após DECISÃO-2.
