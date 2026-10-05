# Nota, modelos e Início

## A nota como página

A nota é uma folha só, como no Word: a barra de funções fica no topo, e o
título, o texto, as checklists, as tabelas, os blocos de código e os anexos
correm dentro da página.

No banco nada mudou. A nota continua uma lista de seções (`text`, `checklist`,
`table`, `code`, ver `backend/content/schemas.py`), então notas antigas abrem
sem migração e a exportação, a busca e o Laviel seguem iguais. A página segue
uma regra (`frontend/src/lib/nota.js`):

> sempre há texto no começo, entre dois blocos e no fim.

É o parágrafo que o Word mantém depois de uma tabela: é onde o cursor cai ao
sair de um bloco e onde se digita "/" para inserir o próximo. Textos vizinhos
viram um só.

### Criar sem o mouse

| Para | Faça |
|---|---|
| Inserir qualquer bloco | `/` no começo da linha (ou depois de um espaço) e o nome: `/tab`, `/cod`, `/check` |
| Checklist | `[] ` ou `[x] ` no começo da linha, ou Ctrl+Shift+9 |
| Título | `# `, `## `, `### `, ou Ctrl+Alt+1 a 3 (Ctrl+Alt+0 volta ao texto normal) |
| Lista | `- ` ou Ctrl+Shift+8 |
| Lista numerada | `1. ` ou Ctrl+Shift+7 |
| Citação | `> ` |
| Código | ` ``` ` |
| Divisor | `---` e Enter |
| Sair de um bloco | Ctrl+Enter (e Esc no código); Enter num item vazio encerra a checklist |
| Andar pela página | As setas e o Backspace atravessam os blocos |
| Desfazer | Ctrl+Z desfaz também inserir, mover e apagar bloco. Logo depois de um atalho, ele traz de volta o que foi digitado (`[] ` volta a ser texto) |

O AltGr do teclado brasileiro também chega como Ctrl+Alt; os atalhos de título
o ignoram, e o `²` continua sendo digitado.

No título, Enter cria a nota e o cursor desce para o texto. Uma nota vazia
sugere os modelos de nota mais usados.

### Barra de funções

`components/editors/BarraDeFuncoes.jsx`. Ela age sobre o trecho onde o cursor
está, sem roubar o foco do texto. A cor da letra é o "A" sublinhado: o clique
aplica a última cor usada, e a setinha abre a paleta, com "Automática" (volta à
cor do tema) e uma cor personalizada. O marca-texto funciona do mesmo jeito.
No celular, a barra é uma fileira que rola de lado.

## Modelos

Ficam na barra lateral, acima da Lixeira (`/templates`). São duas prateleiras:

- **Do Notefy** (`frontend/src/lib/modelos.js`): aula, reunião, diário, plano
  de estudos, lista de tarefas, fichamento, projeto, receita, semana, controle
  de notas, orçamento, fluxograma e mapa mental. São texto de interface,
  traduzido com o resto. O teste `modelos.test.mjs` confere o formato, e cada
  um passa no `validate_data` do backend.
- **Meus modelos** (`/api/templates/`, modelo `Template` em `content`): saem de
  "Salvar como modelo", no menu de um item ou na barra do editor. O servidor
  copia o conteúdo do item; editar o item depois não mexe no modelo.

Usar um modelo abre o editor em modo de criação com o conteúdo
(`/notes/new?modelo=...`). Nome e pasta continuam escolha de quem cria, e a
pasta vem junto quando se parte de uma pasta ("Novo a partir de modelo..." no
menu dela). Excluir um modelo é definitivo e não toca nos itens criados a partir
dele. O backup leva os modelos.

Uma imagem dentro de um modelo aponta para o arquivo do item de origem. Se esse
item for apagado de vez, a imagem some do modelo.

## Início

`frontend/src/pages/Home.jsx` e `components/inicio/`. Ele é montado em blocos,
como a tela inicial do Evernote:

- capa com a saudação;
- resumo;
- itens recentes ou com estrela, em cartões, pilha ou lista;
- minhas tarefas, para marcar ou criar com Enter;
- agenda do dia;
- bloco de rascunho, que pode virar nota;
- arquivos recentes;
- categorias.

"Personalizar" escolhe a capa, quais blocos aparecem, em que ordem e com que
largura. A ordem se muda pelas setas, que funcionam com mouse, teclado e toque.

As capas são materiais de estudo desenhados em CSS (caderno pautado,
quadriculado, lousa, kraft, tecido de encadernação, grafite e a cor do app),
ou uma foto: do computador, dos seus arquivos (inclusive a imagem colada numa
nota) ou arrastada direto para a capa. A foto enviada fica em
`UserPreferences.home_cover` (`POST/DELETE /api/me/cover/`), uma por conta.

Escolhida a foto, a capa abre no recorte: arrastar (mouse ou dedo) move a
foto, o controle aproxima, as setas também movem, Enter salva e Esc cancela.
"Recortar", na capa ou no quadro da foto em "Personalizar", volta a ele. O
recorte é guardado como ponto (`x`, `y`, em %) e `zoom`, e não em pixels:
`object-position` mantém aquele ponto da foto no mesmo ponto da faixa, então
ele vale em qualquer largura de tela.

## Recentes e Arquivos

Tudo em grupos por data, como no Google Fotos: Hoje, Ontem, Esta semana,
Semana passada, Este mês e, antes disso, um grupo por mês (`grupoDaData` em
`lib/utils.js`). Recentes agrupa pela última edição; Arquivos, pela data em
que o arquivo entrou. A semana começa no domingo, como no Calendário.

## Propriedades

O último item do botão direito de qualquer nota, planilha, diagrama, canvas,
arquivo, pasta ou categoria, como no Explorer do Windows
(`components/modals/PropriedadesModal.jsx`, aberto pelo
`PropriedadesProvider`). Mostra nome (editável), tipo, local, tamanho ou
conteúdo, datas de criação, modificação e abertura, e os atributos. Item tem
ainda a aba Organização: pasta, etiquetas, status e cor. Pasta e categoria
mostram o que contêm e o tamanho da subárvore (`/api/folders/<id>/properties/`
e `/api/categories/<id>/properties/`).

**Somente leitura** (`Document.is_read_only`) protege o conteúdo, como o
atributo do Windows: o editor abre sem barra e sem nada editável, com a faixa
"Permitir edição", e o servidor recusa com 423 qualquer mudança em `data`,
`content` ou no arquivo (inclusive esvaziar e a IA gravar por cima). Nome,
pasta, etiquetas e estrela continuam mudando, e a cópia de um item somente
leitura nasce editável.

## Fontes

Em Configurações > Aparência: a fonte do app (padrão, humanista ou serifada) e
a das notas (a mesma do app, serifada, Georgia, humanista ou monoespaçada). Só
fontes do sistema, por aparelho, aplicadas por `--fonte-app` e `--fonte-nota`
(`lib/fontes.js`).

Tudo fica na conta, em `UserPreferences.home_layout` (JSON) e `scratch_pad`
(texto). O formato é conferido por `backend/users/inicio.py`: o que o app não
conhece cai fora, e a capa de imagem só aceita um arquivo de `/media/`. A mescla
com os blocos que existem hoje está em `frontend/src/lib/inicio.js`: um bloco
novo aparece no fim, visível.
