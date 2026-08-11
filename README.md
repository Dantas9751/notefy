# Notefy

Plataforma de produtividade e estudos — um **Drive somado a um Notion**:
notas em texto rico, arquivos, planilhas, diagramas UML e canvas convivem nas
mesmas pastas e categorias, com planner de calendário e Kanban por cima.

Arquitetura **headless**: o Django serve exclusivamente uma API REST em JSON e
o React consome essa API como SPA. Não há template de aplicação no backend —
apenas o `/admin`.

```
notefy/
├── backend/          Django 5 + DRF + PostgreSQL
│   ├── core/         Modelos abstratos, paginação, permissões, viewset base
│   ├── users/        Usuário (login por e-mail), JWT, preferências
│   ├── organization/ Categorias e pastas hierárquicas
│   ├── content/      Document: nota, arquivo, planilha, diagrama, canvas
│   ├── planner/      Tarefas e checklists
│   └── search/       Busca global unificada
├── frontend/         React 18 + Vite + Tailwind + React Router + Axios
└── docker-compose.yml   PostgreSQL para desenvolvimento
```

## Os cinco tipos de conteúdo

| Tipo | Rota | O que é |
| --- | --- | --- |
| **Nota** | `/notes` | Seções de texto rico e de código com destaque de sintaxe; exporta em PDF. |
| **Planilha** | `/sheets` | 14 tipos de coluna, fórmulas com condicionais e texto, resumo por coluna, ordenação e filtros. |
| **Diagrama** | `/diagrams` | Classes, casos de uso, sequência, atividade, estado, ER e fluxograma — 40+ formas e 20+ conectores. |
| **Canvas** | `/canvas` | Quadro branco: caneta, marcador, marca-texto, borracha, post-its, formas livres e conectores. |
| **Arquivo** | `/files` | Upload de PDF, imagem, áudio, vídeo e documentos, com pré-visualização. |

### Nota

Uma nota é uma sequência de **seções**: texto rico ou código. O bloco de código
tem campo próprio — não é um `<pre>` dentro do HTML — e é isso que permite
escolher a linguagem, colorir a sintaxe e preservar a indentação, que um
`contentEditable` normalizaria. São 28 linguagens; colar um trecho reconhecível
já seleciona a linguagem sozinho.

O editor é um `<textarea>` transparente sobre o HTML colorido: o usuário digita
num campo comum — com seleção, desfazer e Tab indentando — e enxerga as cores
por baixo.

**Exportar em PDF** (`/documents/{id}/pdf/`) tem duas saídas: `GET` baixa o
arquivo, `POST` salva o PDF como um item na mesma pasta da nota, com categoria
e busca como qualquer outro arquivo. O código sai colorido também no PDF —
Pygments no servidor, com estilos inline, porque o xhtml2pdf ignora folhas de
estilo separadas.

### Planilha

Colunas de texto, texto longo, número, moeda, porcentagem, data, data e hora,
seleção, seleção múltipla, caixa, avaliação, link, e-mail e fórmula. Cada
coluna escolhe um resumo para o rodapé (soma, média, mínimo, máximo,
contagem, preenchidas, vazias, % preenchida) e o formato numérico.

As fórmulas cobrem aritmética, comparação, concatenação (`&`), agregação
(`SOMA`, `MEDIA`, `MEDIANA`, `MIN`, `MAX`, `CONT`), agregação condicional
(`SOMASE`, `CONT_SE`), lógica (`SE`, `E`, `OU`, `NAO`), texto (`CONCAT`,
`MAIUSC`, `ESQUERDA`, `NUM_CARACT`) e data (`HOJE`, `DIAS`). Aceitam `;` ou
`,` como separador e leem números no formato brasileiro.

O cabeçalho tem as mecânicas de uma planilha comum: arrastar a divisória
redimensiona, duplo clique nela ajusta ao conteúdo, clicar no nome seleciona a
coluna inteira e arrastar o cabeçalho reordena.

Ordenar e filtrar são **visão**: a ordem das linhas no payload não muda, senão
as referências das fórmulas (`A1`, `A2`…) passariam a apontar para outras
células. Reordenar **colunas**, ao contrário, muda de verdade o que cada letra
endereça — é o mesmo que recortar e inserir uma coluna no Excel, e o resultado
aparece na hora.

### Diagrama

Um vocabulário só, agrupado por família na paleta — e nada impede misturar
um ator com um processo no mesmo quadro, porque um diagrama de verdade
raramente respeita a fronteira do livro-texto.

Classes (classe, interface, abstrata, enum, pacote, componente, nó de
implantação) · casos de uso (ator, caso de uso, fronteira, controle,
entidade) · sequência (linha de vida, ativação, fragmento alt/loop/par) ·
atividade e estado (início, fim, ação, decisão, bifurcação, sincronização) ·
ER (entidade, entidade fraca, relacionamento, atributo, atributo-chave) ·
fluxograma (terminal, processo, entrada/saída, banco, documento, manual,
espera) · genéricos.

Conectores com ponta e cauda próprias: herança e implementação com triângulo,
composição e agregação com losango, mensagens de sequência (síncrona,
assíncrona, retorno, criação, destruição) e cardinalidade ER em pé-de-galinha.
Cada aresta aceita rótulo central e multiplicidade nas duas pontas.

### Canvas

Quadro branco de verdade, com a mecânica de um programa de pintura: caneta,
marcador, marca-texto e borracha desenham à mão livre; **forma escolhida na
barra é desenhada arrastando**, com prévia elástica; **a ferramenta de texto
cria a caixa no clique** e já abre a edição. Post-its, cartões, imagens e
áreas saem da paleta com tamanho padrão — são blocos de conteúdo, e
dimensioná-los antes de haver texto dentro seria trabalho sem propósito.

Atalhos: `V` seleção, `P` caneta, `M` marcador, `H` marca-texto, `E` borracha,
`T` texto, `R` retângulo, `O` elipse, `L` linha.

Os traços vivem numa lista própria no payload (`strokes`), separada de nós e
arestas: um traço não conecta nem tem borda de encaixe, então tratá-lo como nó
só criaria casos especiais em todo o motor.

Os cinco são o **mesmo modelo** (`Document`, distinguido por `kind`), então
qualquer pasta ou categoria mistura os tipos livremente, e "o que tem nesta
pasta?" continua sendo uma query só.

---

## Como rodar

### 1. Banco de dados

```bash
docker compose up -d
```

Sobe um PostgreSQL 16 em `localhost:5432` (banco `notefy`, usuário `banco`).
Se preferir um Postgres já instalado, crie o banco manualmente e ajuste o
`.env` do backend.

### 2. Backend

```bash
cd backend && cp .env.example .env && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt && .venv/Scripts/python manage.py migrate && .venv/Scripts/python manage.py runserver
```

API em `http://127.0.0.1:8000/api/` · documentação interativa em `/api/docs/`.

Para criar um usuário administrador:

```bash
cd backend && .venv/Scripts/python manage.py createsuperuser
```

### 3. Frontend

```bash
cd frontend && npm install && npm run dev
```

App em `http://localhost:5173`. O Vite faz proxy de `/api` e `/media` para o
Django, então em desenvolvimento não há CORS envolvido.

---

## Modelagem

| Modelo | Módulo | Papel |
| --- | --- | --- |
| `User` | users | Login por e-mail, sem username. PK em UUID. |
| `UserPreferences` | users | Tema, tela inicial, estado da sidebar. |
| `Category` | organization | Tag global do usuário, com cor e ícone. |
| `Folder` | organization | Pasta auto-relacionável, com `path` materializado. |
| `Document` | content | Nota, arquivo, planilha, diagrama ou canvas — `kind` decide. |
| `Task` | planner | Tarefa com janela temporal, prioridade e status. |
| `ChecklistItem` | planner | Subitem de tarefa. |

### Decisões que valem conhecer

**Um item é um item.** Nota, arquivo, planilha, diagrama e canvas são um só
modelo. Cinco tabelas separadas obrigariam cada pasta a consultar cinco
lugares, cada filtro a ser escrito cinco vezes e a busca a ter cinco ramos —
e a interface a ter cinco tipos de card. O preço é um punhado de colunas que
só valem para certos tipos (`file` para arquivos, `content` para notas, `data`
para os editores visuais); no Postgres coluna nula não ocupa espaço.

**O formato de `data` mora num lugar só.** `content/schemas.py` define o
payload de planilha, diagrama e canvas, valida a estrutura e extrai texto para
a busca. `GET /api/documents/palette/` serve o mesmo vocabulário ao frontend,
para que as formas válidas não sejam constantes duplicadas que saem de
sincronia.

**Busca pelo conteúdo, não só pelo título.** O texto extraído de dentro do
payload entra no índice, então uma planilha é encontrável por uma célula e um
diagrama pelo nome de uma classe. Nome de arquivo também é indexado quebrado
em palavras — o Postgres trata `relatorio_final.pdf` como um token único, e
sem isso buscar "relatorio" não acharia nada.

**Fórmulas sem `eval()`.** O avaliador da planilha é um parser recursivo
descendente próprio (`frontend/src/lib/formula.js`). Um `eval()` executaria
qualquer JavaScript escrito numa célula, o que viraria um buraco de segurança
no instante em que uma planilha fosse compartilhada.

**Um motor para dois editores visuais.** Diagrama e canvas são nós e setas num
plano; o `GraphEditor` é o mesmo nos dois e só a paleta muda. Duas telas
distintas, mecânica idêntica — quem aprende uma sabe usar a outra.

**Pastas infinitas sem loops.** `Folder` guarda, além do ponteiro `parent`, um
caminho materializado (`path = "<uuid pai>/…/<uuid próprio>/"`). Com ele, a
subárvore inteira sai numa query (`path__startswith`) e a detecção de ciclo
vira uma comparação de strings: mover A para dentro de B é ilegal se e somente
se `B.path` começa com `A.path`. Há três camadas de proteção — `clean()` no
model, `CheckConstraint` no banco contra auto-referência direta, e um teto de
`MAX_FOLDER_DEPTH = 12` níveis. Ao mover uma pasta, `_rebuild_subtree()`
reescreve o `path` dos descendentes.

**Apagar pasta não apaga conteúdo.** `Document.folder` usa `SET_NULL`: o item
volta para a raiz em vez de sumir junto com a pasta. `Folder.parent` usa
`CASCADE` (subpastas acompanham a pasta pai), mas o conteúdo sobrevive.

**Busca em duas velocidades.** `Document` mantém uma coluna `search_vector`
(tsvector com índice GIN), atualizada por signal em `transaction.on_commit`.
A busca tenta full-text primeiro — título com peso A, conteúdo com peso B — e
cai para `icontains` quando o termo ainda não casa com nenhum lexema, o que
mantém resultados enquanto o usuário digita.

**Isolamento por usuário em duas camadas.** `OwnedModelViewSet` filtra todo
queryset por `owner`, e `OwnedPrimaryKeyRelatedField` valida os
relacionamentos na escrita — sem ele, um cliente poderia mover a própria nota
para a pasta de outra pessoa enviando um UUID alheio.

**Prioridade é inteiro.** `Task.priority` usa `IntegerChoices` porque o Kanban
ordena por prioridade, e texto ordenaria alfabeticamente ("alta" antes de
"urgente").

---

## Endpoints

Todos sob `/api/`, autenticados via `Authorization: Bearer <access>`.

### Autenticação
| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/auth/register/` | Cria conta e já devolve os tokens |
| POST | `/auth/login/` | Devolve `access`, `refresh` e o usuário |
| POST | `/auth/refresh/` | Renova o access token |
| POST | `/auth/logout/` | Revoga o refresh token |
| POST | `/auth/change-password/` | Altera a senha |
| GET/PATCH | `/me/`, `/me/preferences/` | Perfil e preferências |

### Recursos
`/categories/` · `/folders/` · `/documents/` · `/tasks/` · `/checklist-items/`
— CRUD completo com filtros, `search` e `ordering`.

`/documents/` serve os cinco tipos; `?kind=spreadsheet` (repetível) dá as
visões por formato, e `?folder=`, `?category=`, `?status=`, `?file_kind=`
filtram o resto.

### Rotas especiais
| Rota | Descrição |
| --- | --- |
| `GET /folders/tree/` | Árvore hierárquica completa (uma query) |
| `GET /folders/{id}/contents/` | Subpastas + documentos de todos os tipos + tarefas |
| `GET /documents/recent/` | Últimos itens editados |
| `GET /documents/stats/` | Contagem por tipo |
| `GET /documents/palette/` | Formas, conectores e tipos de coluna válidos |
| `POST /documents/upload/` | Upload de vários arquivos direto numa pasta |
| `POST /documents/{id}/move/` | Move o item para outra pasta |
| `POST /documents/{id}/duplicate/` | Duplica o item |
| `POST /documents/{id}/reset/` | Esvazia o payload de um editor visual |
| `GET /tasks/calendar/?start=&end=` | Eventos no formato do calendário |
| `GET /tasks/board/` | Tarefas agrupadas por coluna do Kanban |
| `POST /tasks/{id}/move/` | Drag-and-drop: muda status e/ou posição |
| `GET /search/` | Busca global unificada |
| `GET /search/facets/` | Opções para os dropdowns de filtro |

A busca global aceita `q`, `type` (repetível — os cinco tipos de documento
mais `folder` e `task`), `category` (repetível), `status`, `date_from`,
`date_to` e `limit`, e devolve tudo numa lista com formato único — o frontend
renderiza um resultado sem saber de qual tabela ele veio.

---

## Frontend

- **Um lugar para cada tipo, uma mecânica só.** Cada formato tem sua rota e
  seu ícone, mas todas as listas usam o mesmo `Library` e todos os editores a
  mesma casca (`DocumentEditor`): título, salvar, propriedades, anexos,
  excluir. Trocar de tipo não exige reaprender a interface.
- **A pasta funciona como Drive.** Os cinco tipos aparecem na mesma grade,
  com chips para filtrar por tipo sem sair da tela, e soltar arquivos em
  qualquer ponto envia para aquela pasta.
- **Autosave nos editores visuais.** Planilha, diagrama e canvas salvam
  sozinhos 1,5 s após a última alteração — exigir Ctrl+S a cada arraste seria
  hostil. Nota fica manual, porque digitar dispara mudança a cada tecla.
- **O status da tarefa é o lugar dela no quadro.** Três colunas — a fazer, em
  progresso, concluída — e o `+` de cada uma cria já naquele status; arrastar
  entre colunas é a forma de mudá-lo. "Bloqueada" e "Cancelada" saíram porque
  descreviam um motivo, não uma posição no fluxo. Tarefa criada pelo
  calendário nasce como "a fazer"; a data é que a posiciona.
- **Formas redimensionam por oito alças**, nos cantos e nas bordas, como em
  qualquer editor gráfico. Puxar pela borda esquerda ou superior move a origem
  e encolhe na mesma medida, para a forma não escapar do cursor.
- **Sidebar retrátil** com árvore de pastas recursiva e colapsável; o estado
  de expansão e o de recolhimento persistem em `localStorage`.
- **JWT com refresh transparente**: o interceptor do Axios enfileira as
  requisições que tomaram 401 e dispara **um** refresh para todas — sem a fila,
  com `ROTATE_REFRESH_TOKENS` ligado, o primeiro refresh invalidaria os demais
  e derrubaria a sessão sem motivo.
- **Estados de carregamento** em toda tela (skeletons que preservam o layout),
  modais para criação rápida e navegação sem reload.
- **Tema claro/escuro** com opção de seguir o sistema.
- `Ctrl/Cmd+K` abre a busca global; `Ctrl/Cmd+S` salva a nota aberta.

### Design

Minimalista, inspirado no Notion: cinzas levemente quentes (o cinza puro do
Tailwind fica frio numa tela de leitura), largura de texto limitada a ~70
caracteres, entrelinha 1.75, bordas suaves e stack de fontes do sistema — zero
requisição de rede, renderização imediata. Tokens em
[`tailwind.config.js`](frontend/tailwind.config.js).
