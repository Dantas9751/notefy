# Notefy — Roadmap de Features Futuras (Revisado)

> **Você é o Claude Code** (ou outro agent de coding) lendo este documento. Sua tarefa é implementar as features abaixo **uma por uma**, validando antes de seguir. Leia o `README.md` e a estrutura do projeto antes de tocar em qualquer arquivo.

---

## 🧭 Princípios inegociáveis

Estes princípios vêm ANTES de qualquer decisão técnica. Releia antes de cada feature.

1. **Backward compat primeiro.** Toda feature precisa funcionar com o banco SQLite existente (`backend/db.sqlite3`). Migração destrutiva é proibida. Novos campos vão em `JSONField` quando possível.

2. **Undo/redo é lei.** Toda ação mutável no canvas, diagrama e notas registra no histórico. `Ctrl+Z` reverter. Nunca introduzir ação "fora do histórico". Teste manual obrigatório: mexer → Ctrl+Z → estado volta exatamente.

3. **IA nunca bloqueia o core.** Sem API key configurada, o app funciona 100%. Endpoints `/api/ai/*` retornam `503` com `{error: "ia_not_configured"}`. Menus de IA somem da UI. Nenhuma feature existente quebra se a IA falhar.

4. **Sem servidor externo.** App distribuído como `.msi`/`.exe` (Tauri + PyInstaller). Cada user traz a própria API key. SQLite local em `%APPDATA%\Notefy\`.

5. **Canvas ≠ Diagrama, mas compartilham motor.** O `GraphEditor` é único; a diferença é `data.kind` e o que o payload aceita. **Diferenciais exclusivos do canvas** (borracha, strokes livres, z-axis para desenhar por cima de formas, paleta livre sem regras semânticas) só aparecem quando `kind === "canvas"`. **Diferenciais exclusivos do diagrama** (conectores semânticos UML, validação de regras) só aparecem quando `kind === "diagram"`. **Features comuns de UX** (marquee, agrupamento, snap-to-grid, zoom, pan, copiar/colar, undo/redo, tema independente do quadro) funcionam em ambos.

6. **Tema independente do quadro é específico do canvas/diagrama.** O quadro (background) pode ter tema claro/escuro próprio, sem mexer no tema global do app nem dos outros documentos.

7. **Edição visual primeiro, abstração depois.** Não criar `interface X` "para o futuro". Criar código que resolve o problema de hoje, marcar com `ponytail:` quando houver teto conhecido.

---

## 📐 Arquitetura-alvo (antes de codar)

```
notefy/
├── backend/
│   ├── content/          ← Document, schemas, serializers, views
│   ├── organization/     ← Folder (path materializado), Category
│   ├── planner/          ← Task, Board, ChecklistItem
│   ├── users/            ← User, UserPreferences
│   ├── core/             ← BaseModel, validadores, pagination
│   ├── search/           ← GlobalSearchView, SearchFacetsView
│   ├── ai/               ← NOVO app (F9-F12)
│   └── exports/          ← NOVO app (F6)
└── frontend/
    ├── src/
    │   ├── pages/        ← DocumentEditor, Library, FavoritesView (novo)
    │   ├── components/
    │   │   ├── editors/  ← GraphEditor (F2, F3, F7), NoteEditor, SpreadsheetEditor
    │   │   ├── layout/   ← AppLayout (F4), Sidebar, TabBar (novo)
    │   │   └── ai/       ← NOVO diretório (F11)
    │   ├── context/      ← UIContext (F4, F11), WorkspaceContext
    │   ├── hooks/        ← useUndoRedo, useTabSync (F4), useExport (F6)
    │   └── lib/          ← graph.js (F7), formula.js
    └── src-tauri/        ← Rust commands (F4)
```

---

## 🚦 Ordem de execução

| Release | Features | Por quê |
|---------|----------|---------|
| **R1** Quick wins | F1, F2, F3 | Baixa complexidade, alto impacto, sem dependência |
| **R2** Navegação | F4, F5 | Mudam a casca (workspace + preview), não o conteúdo |
| **R3** Canvas + Export | F6, F7, F8 | Canvas melhorado + export ZIP + slides |
| **R4** IA fundação | F9, F10, F11 | Setup da key + endpoints + 5 acessos |
| **R5** IA avançada | F12 | Auto-tag, backlinks, batch |

**NÃO misture releases.** Faça R1 inteiro, valide (lint + test + build), commita. Depois R2. Etc.

---

# 📦 Release 1 — Quick Wins

## F1 — Favoritos unificados (estrela = fixado)

### Contexto
Hoje `Document` tem dois campos booleanos separados: `is_favorite` e `is_pinned`. O user relatou que isso gera comportamento ambíguo na UI (qual a diferença entre favoritar e fixar?). Decisão de produto: **um conceito só** — favoritar com a estrela já fixa o item no topo da pasta onde ele mora. `Category` mantém `is_pinned` separado (contexto diferente: fixar categoria no topo da sidebar é independente).

### O que muda
- **Remover** `is_pinned` de `Document` (apenas Document, não Category nem Folder).
- **Manter** `is_favorite`. Quando `is_favorite=True`, o item aparece:
  - No topo da listagem da pasta onde está (ordenação padrão).
  - Em `/favorites/` (página agregadora cruzando docs/pastas/tasks).
- Botão de estrela em `DocumentCard`, header do editor, sidebar de navegação.
- Atalho `Ctrl+Shift+F` no editor faz toggle do item aberto.
- Delete de favorito exige confirmação (já tem `423 Locked` no backend, falta UI).

### Backend

**Arquivos a tocar:**
- `backend/content/models.py` — remover `is_pinned = BooleanField`. Trocar `ordering = ("-is_pinned", "-updated_at")` por `ordering = ("-is_favorite", "-updated_at")`.
- `backend/content/serializers.py` — remover `"is_pinned"` dos `fields` em `DocumentListSerializer` e `DocumentSerializer`. Mesma coisa em filtros.
- `backend/content/views.py` — trocar `ordering = ("-is_pinned", "-updated_at")` por `("-is_favorite", "-updated_at")`. No método `duplicate`, remover `original.is_pinned = False` (campo não existe mais).
- `backend/core/backup.py` — remover chave `is_pinned` do dict de export e do loop de import. Manter `is_favorite`.
- Novo arquivo: `backend/content/migrations/0006_remove_document_is_pinned.py` — operação `RemoveField`.

**Migration (gerar com `makemigrations`, revisar antes de commitar):**
```python
class Migration(migrations.Migration):
    dependencies = [("content", "0005_document_unique_document_title_per_kind_and_folder")]
    operations = [
        migrations.RemoveField(model_name="document", name="is_pinned"),
        migrations.AlterModelOptions(
            name="document",
            options={"ordering": ("-is_favorite", "-updated_at"), "verbose_name": "documento", "verbose_name_plural": "documentos"},
        ),
    ]
```

**Endpoint novo:** `GET /api/favorites/` — retorna lista mista de documentos/pastas/tasks favoritos do user autenticado. Reutiliza o padrão de `GlobalSearchView` (resultados com `type`, `id`, `title`, `subtitle`, `url`).

```python
# backend/content/views.py (adicionar)
class FavoritesView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        docs = Document.objects.filter(owner=request.user, is_favorite=True, deleted_at__isnull=True).select_related("folder")[:50]
        folders = Folder.objects.filter(owner=request.user, is_favorite=True, deleted_at__isnull=True).select_related("category")[:20]
        tasks = Task.objects.filter(owner=request.user, is_favorite=True, deleted_at__isnull=True)[:30]
        # retorna lista unificada, ordenada por updated_at desc
```

### Frontend

**Arquivos a tocar:**
- `frontend/src/components/DocumentCard.jsx` — remover botão de pin separado. Manter só estrela. Quando `is_favorite=true`, mostra badge "fixado" pequeno.
- `frontend/src/components/layout/Sidebar.jsx` — entrada "Favoritos" no topo (ícone estrela) apontando pra `/favorites`.
- `frontend/src/pages/DocumentEditor.jsx` — handler `Ctrl+Shift+F` que faz PATCH `/api/documents/{id}/` com `{is_favorite: !current}`.
- Novo: `frontend/src/pages/FavoritesView.jsx` — consome `/api/favorites/`, renderiza cards por tipo (doc/pasta/task).
- `frontend/src/hooks/useDocumentActions.jsx` — adicionar função `toggleFavorite(doc)`.

### Critérios de aceitação
- [ ] `is_pinned` removido de `Document`. Não há referência órfã no código (grep `is_pinned` retorna só `Category` e `Folder`).
- [ ] Migration aplicada sem erro. Banco abre normalmente.
- [ ] Favoritar um documento: aparece no topo da pasta E em `/favorites/`.
- [ ] `Ctrl+Shift+F` no editor alterna favorito. Indicador visual atualiza.
- [ ] Tentar deletar favorito: backend retorna 423, UI mostra confirmação.
- [ ] Backup/restore continua funcionando (sem `is_pinned`).

### Validação
```bash
cd backend && python manage.py makemigrations --dry-run --check
cd backend && python manage.py migrate
cd backend && python manage.py test content.tests --keepdb
cd frontend && npm run lint
cd frontend && npm run build
```

---

## F2 — Tema independente do Canvas/Diagrama

### Contexto
Hoje o fundo do canvas/diagrama segue o tema global do app (claro/escuro). User quer poder alternar **só no quadro**, sem mexer no resto da UI. Útil pra desenhar em fundo claro enquanto a UI tá em dark, ou vice-versa.

**Escopo:** apenas canvas e diagrama. Não afeta tema global, nem notas, planilhas, arquivos.

### O que muda
- Novo campo no payload `data` do documento (kind=canvas|diagram): `theme: "light" | "dark" | "system"` (default `"system"` = segue app).
- Toggle pequeno no header do editor (`Sol`/`Lua`) ao lado dos controles de zoom.
- Background e grid recalculam em tempo real.
- Persiste no payload (JSONField, sem migration).
- Se o user tem 50 canvas salvos antes dessa feature, todos continuam válidos (campo ausente = `"system"`).

### Backend

**Arquivos a tocar:**
- `backend/content/schemas.py` — adicionar `THEME_CHOICES = ("light", "dark", "system")`. Atualizar `empty_data_for()` pra incluir `"theme": "system"` no payload inicial de canvas e diagram.
- `backend/content/views.py` — na action `palette`, incluir `"themes": [{"value": v, "label": l} for v, l in zip(["light", "dark", "system"], ["Claro", "Escuro", "Sistema"])]`.

**Schema (sem validação rígida — campo livre):**
```python
# Não precisa de validação específica no schema, é só um campo string no JSON.
# Mas documentar em comment no schemas.py que canvas e diagram aceitam `theme`.
```

### Frontend

**Arquivos a tocar:**
- `frontend/src/components/editors/GraphEditor.jsx` — ler `document.data.theme`, aplicar no background do container SVG/Canvas. Toggle no header chama PATCH `/api/documents/{id}/` com `data: {...current, theme: newTheme}`.
- `frontend/src/components/layout/GraphToolbar.jsx` (se existir; senão inline no GraphEditor) — botão de tema.

**Lógica de resolução:**
```js
function resolveTheme(docTheme, appTheme) {
  if (docTheme === "system") return appTheme;
  return docTheme;
}
```

### Critérios de aceitação
- [ ] Canvas e diagram novos já vêm com `theme: "system"` no payload.
- [ ] Canvas/diagram antigos (sem campo) abrem sem erro, usam `"system"`.
- [ ] Toggle no header alterna tema do quadro em <100ms.
- [ ] Tema do quadro NÃO afeta tema da sidebar, notas, planilhas.
- [ ] Dois canvas abertos em abas diferentes podem ter temas independentes.

### Validação
```bash
cd backend && python manage.py test content.tests --keepdb
cd frontend && npm run lint
# teste manual: abrir canvas, alternar tema, verificar persistência após reload
```

---

## F3 — Tamanho de caneta, marca-texto e borracha (Canvas only)

### Contexto
Hoje a espessura dos strokes no canvas é fixa. User precisa controlar independentemente:
- **Espessura da caneta** (pen): `lineWidth` do traço.
- **Opacidade do marca-texto** (highlighter): independente da espessura.
- **Raio da borracha** (eraser): área afetada (não é lineWidth, é um círculo que apaga dentro).

**Escopo:** SOMENTE CANVAS. Diagrama não tem strokes livres, então não tem esses controles.

### O que muda

#### 1. Persistência por user
Adicionar 3 campos em `UserPreferences`:
- `canvas_pen_size` (PositiveSmallIntegerField, default 3, range 1-20).
- `canvas_highlighter_opacity` (PositiveSmallIntegerField, default 30, range 10-80, percentual).
- `canvas_eraser_radius` (PositiveSmallIntegerField, default 24, range 10-80).

Migration: `backend/users/migrations/0002_*.py` (gerar com `makemigrations`).

#### 2. Stroke payload
Stroke atual no canvas tem: `tool`, `points`, `color`, `id` (provavelmente). Adicionar:
- `width` (number, obrigatório para strokes novos — fallback 3px se ausente).
- `opacity` (number, default 1.0, obrigatório para marca-texto).

**Backward compat:** strokes antigos (sem `width`) renderizam com 3px default. Sem quebra.

#### 3. Toolbar do canvas
Adicionar 3 sliders na toolbar do canvas (só aparece quando `kind === "canvas"` e ferramenta atual é `pen`, `highlighter` ou `eraser`):

```
[Pen] [Marker] [Highlighter] [Eraser]
   │                              │
   └─── slider: 1─20px ────────────┘
   
   ─── slider: 10─80% (só visível se Highlighter ativo)
   
   ─── slider: 10─80px (só visível se Eraser ativo)
```

#### 4. Renderização
- **Pen:** `ctx.lineWidth = stroke.width`
- **Highlighter:** `ctx.globalAlpha = stroke.opacity` (e lineWidth também usa stroke.width)
- **Eraser:** `ctx.clearRect` em círculo centrado em cada ponto, raio = `eraser_radius` (vem das preferences ou do stroke)

### Backend

**Arquivos a tocar:**
- `backend/users/models.py` — adicionar 3 campos em `UserPreferences`.
- `backend/content/schemas.py` — adicionar `STROKE_FIELDS = ("tool", "points", "color", "width", "opacity")` como hint, validação mínima só pra não quebrar.

**Migration:**
```python
class Migration(migrations.Migration):
    dependencies = [("users", "0001_initial")]
    operations = [
        migrations.AddField(model_name="userpreferences", name="canvas_pen_size", field=models.PositiveSmallIntegerField(default=3)),
        migrations.AddField(model_name="userpreferences", name="canvas_highlighter_opacity", field=models.PositiveSmallIntegerField(default=30)),
        migrations.AddField(model_name="userpreferences", name="canvas_eraser_radius", field=models.PositiveSmallIntegerField(default=24)),
    ]
```

### Frontend

**Arquivos a tocar:**
- `frontend/src/components/editors/GraphEditor.jsx` — toolbar com 3 sliders condicionais, renderização com `width` e `opacity` do stroke, borracha com raio configurável.
- `frontend/src/components/ui/Slider.jsx` — se não existir, criar componente slider acessível (aria-valuenow).
- `frontend/src/hooks/useUserPreferences.js` — se não existir, hook que busca e atualiza preferences via `/api/me/preferences/`.

**Validação de ranges antes de salvar:**
```js
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
```

### Critérios de aceitação
- [ ] Sliders aparecem só no canvas, só para a ferramenta ativa relevante.
- [ ] Mudar pen size e desenhar: novo stroke tem `width` correto.
- [ ] Stroke antigo (sem width) renderiza com 3px.
- [ ] Ctrl+Z reverte stroke com seus parâmetros preservados.
- [ ] Valores persistem entre sessões (via UserPreferences).
- [ ] Diagrama não tem esses controles (verificar que não aparece).

### Validação
```bash
cd backend && python manage.py makemigrations
cd backend && python manage.py migrate
cd backend && python manage.py test users.tests --keepdb
cd frontend && npm run lint
# manual: canvas → pen → desenhar → Ctrl+Z → undo ok → redo ok
```

---

# 📦 Release 2 — Navegação

## F4 — Workspace estilo VS Code (abas + janelas)

### Contexto
Hoje cada item aberto substitui o anterior na rota `/notes/{id}`. User quer:
- **Abas internas** no topo da janela: clicar em item abre em nova aba, não substitui.
- **Múltiplas janelas nativas (Tauri):** abrir docs lado a lado em monitores diferentes.
- **Sync entre janelas/abas:** editar numa propaga pra outras abertas do mesmo item.

### O que muda

#### 1. Abas internas (funciona em browser + Tauri)
- Novo `<TabBar/>` no topo de `<AppLayout/>`.
- Estado global em `UIContext`: `tabs: [{id, documentId, kind, title, isDirty}]`, `activeTabId`.
- Cada aba é uma rota isolada com sua própria pilha interna (scroll, zoom).
- Fechar aba com `isDirty=true` pede confirmação.
- `Ctrl+Tab` / `Ctrl+Shift+Tab` navega entre abas.
- `Ctrl+W` fecha aba ativa.

#### 2. Multi-window Tauri (só desktop)
- Comando Rust `open_window(document_id)` que cria `WebviewWindow`.
- Cada janela tem seu próprio `TabBar`.
- Sync via `tauri::event::emit` entre janelas.

#### 3. Sync entre instâncias
- Browser/SPA: `BroadcastChannel('notefy-tabs')` + localStorage.
- Tauri: `tauri::event` listener + emit.
- Ao receber update: recarrega o documento se está aberto em outra aba/janela.

### Backend
Nada crítico. Garantir que `PATCH /api/documents/{id}/` retorna dado fresco. Considerar adicionar `If-Match: <etag>` opcional para evitar conflitos (FUTURO, não obrigatório agora).

### Frontend

**Arquivos novos:**
- `frontend/src/components/layout/TabBar.jsx` — UI das abas.
- `frontend/src/hooks/useTabSync.js` — BroadcastChannel + storage events.
- `frontend/src/hooks/useTabs.js` — gerencia estado de abas (open, close, activate).

**Arquivos a tocar:**
- `frontend/src/context/UIContext.jsx` — adicionar `tabs`, `activeTabId`, `openTab()`, `closeTab()`, `activateTab()`.
- `frontend/src/components/layout/AppLayout.jsx` — renderizar `<TabBar/>` acima do `<Outlet/>`.
- `frontend/src/App.jsx` — adicionar listener de keyboard (Ctrl+W, Ctrl+Tab).
- `frontend/src-tauri/src/main.rs` — comando `#[tauri::command] fn open_window(id: String)`.
- `frontend/src-tauri/src/lib.rs` — registrar o comando.
- `frontend/src/hooks/useDocumentActions.jsx` — ao abrir documento, abrir aba ao invés de navegar.

**BroadcastChannel setup:**
```js
const channel = new BroadcastChannel('notefy-tabs');
channel.onmessage = (e) => {
  if (e.data.type === 'document-updated' && isTabOpen(e.data.documentId)) {
    refetchDocument(e.data.documentId);
  }
};
```

### Critérios de aceitação
- [ ] Clicar em documento abre nova aba, não substitui.
- [ ] Múltiplas abas do mesmo item são mescladas (foca na existente).
- [ ] Ctrl+W fecha aba, pede confirmação se dirty.
- [ ] Editar documento numa aba reflete em outra aberta do mesmo (em <500ms).
- [ ] Tauri: comando `open_window` cria janela nativa independente.
- [ ] Browser sem Tauri: BroadcastChannel funciona entre tabs do mesmo origin.

### Validação
```bash
cd frontend && npm run lint
cd frontend && npm run build
# manual: abrir 3 abas do mesmo doc, editar numa, ver outras atualizarem
```

---

## F5 — Preview nativo de arquivos (sem modal/drawer)

### Contexto
Hoje arquivos (pdf, imagem, txt) abrem em drawer lateral ou modal pequeno. User quer: **abrem ocupando a tela principal como item nativo**, virando aba normal da workspace (integra com F4).

### O que muda
- `Document(kind="file")` aberto vira aba (graças ao F4) e renderiza full-width na área principal.
- Por `file_kind`:
  - **PDF:** `<iframe src={file_url}>` ou `pdf.js` embedado.
  - **Imagem:** `<img>` centralizada com zoom via scroll (Ctrl+scroll).
  - **Áudio:** `<audio controls>` nativo HTML5.
  - **Vídeo:** `<video controls>` nativo HTML5.
  - **Texto/Markdown:** renderiza como nota simples.
  - **Outros:** botão "baixar".

### Backend
Nenhum. Já serve arquivo via rota de media.

### Frontend

**Arquivos novos:**
- `frontend/src/components/preview/PdfViewer.jsx`
- `frontend/src/components/preview/ImageViewer.jsx` (com zoom)
- `frontend/src/components/preview/AudioViewer.jsx`
- `frontend/src/components/preview/VideoViewer.jsx`
- `frontend/src/components/preview/TextViewer.jsx`
- `frontend/src/components/preview/GenericFileViewer.jsx` (botão download)

**Arquivos a tocar:**
- `frontend/src/pages/DocumentEditor.jsx` — branch para `kind === "file"`, switch por `file_kind`.

**ImageViewer com zoom:**
```jsx
function ImageViewer({ src }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div onWheel={(e) => {
      e.ctrlKey && setZoom(z => Math.max(0.5, Math.min(4, z + (e.deltaY > 0 ? -0.1 : 0.1))));
    }}>
      <img src={src} style={{ transform: `scale(${zoom})` }} />
   </div>
  );
}
```

### Critérios de aceitação
- [ ] PDF abre inline com scroll e zoom.
- [ ] Imagem abre centralizada, zoom com Ctrl+scroll (0.5x a 4x).
- [ ] Áudio/vídeo tem controles nativos funcionando.
- [ ] Arquivo abre como aba (não modal), junto com outras abas.
- [ ] Sem drawer lateral em lugar nenhum.

### Validação
```bash
cd frontend && npm run lint
# manual: upload de cada tipo, abrir, verificar render
```

---

# 📦 Release 3 — Canvas + Diagrama + Export

## F6 — Exportação em lote (ZIP com conversão)

### Contexto
User quer selecionar múltiplos itens OU uma pasta inteira e exportar tudo como `.zip`. Cada item convertido pro formato mais útil:
- Nota → `.md` (default) ou `.pdf`
- Planilha → `.csv`
- Diagrama → `.svg`
- Canvas → `.png` (render server-side) ou `.svg`
- Arquivo binário → formato original

### Backend

**Novo app:** `backend/exports/`

**Arquivos novos:**
- `backend/exports/__init__.py`
- `backend/exports/apps.py`
- `backend/exports/views.py` — endpoint `/api/exports/batch/`.
- `backend/exports/converters.py` — funções de conversão por `kind`.
- `backend/exports/zipper.py` — geração do ZIP em memória ou stream.
- `backend/exports/urls.py` — rotas.
- `backend/exports/tests.py` — testes unitários dos conversores.

**Endpoint:**
```python
# POST /api/exports/batch/
# Body: {
#   "items": [doc_id1, doc_id2, ...],
#   "folders": [folder_id1, ...],
#   "format_preferences": {"note": "md", "spreadsheet": "csv", ...}
# }
# Response: FileResponse com ZIP
```

**Conversores:**

```python
# backend/exports/converters.py

def note_to_markdown(doc) -> bytes:
    """Extrai sections do doc.data, gera markdown."""
    sections = doc.data.get("sections", [])
    md_parts = []
    for s in sections:
        if s.get("type") == "code":
            lang = s.get("language", "")
            md_parts.append(f"```{lang}\n{s.get('code', '')}\n```\n")
        else:
            html = s.get("html", "")
            md_parts.append(html_to_markdown(html))
    return "\n\n---\n\n".join(md_parts).encode("utf-8")


def note_to_pdf(doc) -> bytes:
    """Reusa render_pdf existente."""
    from content.export_pdf import render_pdf
    return render_pdf(doc)


def spreadsheet_to_csv(doc) -> bytes:
    columns = doc.data.get("columns", [])
    rows = doc.data.get("rows", [])
    out = []
    out.append(",".join(escape_csv(c.get("name", "")) for c in columns))
    for r in rows:
        cells = r.get("cells", {})
        out.append(",".join(escape_csv(str(cells.get(c["id"], ""))) for c in columns))
    return "\n".join(out).encode("utf-8")


def diagram_to_svg(doc) -> bytes:
    """Serializa nodes/edges como SVG."""
    # Reutilizar lógica do frontend GraphEditor para render
    # OU construir SVG simples com retângulos + linhas
    nodes = doc.data.get("nodes", [])
    edges = doc.data.get("edges", [])
    # calcular bounding box
    # gerar SVG com width/height do bbox
    return svg_string.encode("utf-8")
```

**ZIP generation:**
```python
# backend/exports/zipper.py
import io, zipfile
from django.http import FileResponse

def build_zip(items_data: list[tuple[str, bytes]]) -> io.BytesIO:
    """items_data: [(filename, content_bytes), ...]"""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for filename, content in items_data:
            zf.writestr(filename, content)
    buffer.seek(0)
    return buffer
```

### Frontend

**Arquivos novos:**
- `frontend/src/hooks/useExport.js` — chama `/api/exports/batch/`, baixa o ZIP.

**Arquivos a tocar:**
- `frontend/src/components/layout/FolderTree.jsx` — botão direito na pasta → "Exportar como ZIP".
- `frontend/src/pages/Library.jsx` — multi-seleção → ação em lote "Exportar ZIP".

### Critérios de aceitação
- [ ] Exportar 1 nota gera ZIP com 1 arquivo `.md` válido.
- [ ] Exportar pasta com 5 itens gera ZIP com 5 arquivos + estrutura preservada.
- [ ] Planilha exportada abre corretamente no Excel/LibreOffice.
- [ ] PDF reusa código existente.
- [ ] Arquivo binário mantém formato original.

### Validação
```bash
cd backend && python manage.py test exports --keepdb
cd frontend && npm run lint
# manual: exportar, abrir ZIP, validar cada arquivo
```

---

## F7 — Canvas E Diagrama melhorados (seleção em lote, agrupamento, snap-to-grid)

### Contexto
**ATENÇÃO:** F7 vale para **CANVAS E DIAGRAMA**. As melhorias de UX (marquee, agrupamento, snap-to-grid) são genéricas e beneficiam ambos. O que diferencia canvas de diagrama são apenas os **diferenciais exclusivos do canvas**:

**Diferenciais exclusivos do canvas (mantidos):**
- Strokes livres (pen, marker, highlighter, eraser) — F3.
- **Z-axis:** canvas tem camada de strokes EM CIMA das formas geométricas. No canvas, o user pode desenhar à mão livre por cima de um retângulo, círculo, post-it, etc. Diagrama não tem strokes, então não tem z-axis.
- Paleta livre (canvas aceita qualquer forma geométrica sem regras semânticas).

**Diferenciais exclusivos do diagrama (mantidos):**
- Conectores semânticos (herança, composição, mensagem UML).
- Paleta restrita (UML + ER + fluxograma).
- Validação de regras semânticas.

**Comportamento comum (F7):**
- Marquee selection: vale pra canvas E diagrama.
- Agrupamento: vale pra canvas E diagrama.
- Snap-to-grid: vale pra canvas E diagrama.
- Undo/redo: vale pra ambos (já existe).

### O que muda

#### 1. Sem gate `if (kind === "canvas")` em F7
No `GraphEditor.jsx`, **NÃO** há branch condicional para F7. As features de UX (marquee, grupo, snap) estão sempre disponíveis — para canvas E diagrama. Os diferenciais exclusivos continuam gateados (`if (kind === "canvas")` para strokes/borracha, `if (kind === "diagram")` para validação UML).

#### 2. Marquee selection (canvas E diagrama)
- Ao arrastar com ferramenta `V` (seleção) numa área vazia, retângulo pontilhado aparece.
- Tudo dentro do retângulo vira selecionado (nodes; no canvas, também strokes que estão na área).
- Toolbar mostra "X itens selecionados" + ações em lote (deletar, agrupar, mover).
- Atalho: `Esc` cancela seleção.

#### 3. Agrupamento (canvas E diagrama)
- Nodes podem ter `group: string` no payload (campo novo, opcional).
- Mover nó-pai move todos os filhos juntos.
- Funciona igual em canvas e diagrama — é só organização visual, não muda semântica.
- UI: `Ctrl+G` agrupa nodes selecionados, `Ctrl+Shift+G` desagrupa.
- Visual: nó-pai tem borda tracejada indicando grupo.

#### 4. Snap-to-grid (canvas E diagrama)
- Grid de 20px no fundo do quadro (toggle visual, padrão ligado).
- Ao arrastar nó/forma, se a posição estiver a <8px de uma linha do grid, encaixa.
- Guia visual vermelha aparece quando o nó está alinhado (mesma X ou Y) com outro nó dentro de 5px.
- Funciona igual em canvas e diagrama.

#### 5. Z-axis (canvas ONLY — JÁ EXISTE, manter funcionando)
- Strokes são renderizados DEPOIS dos nodes (z-index maior).
- Isso permite desenhar por cima de formas geométricas.
- Não mexer, só garantir que continua funcionando.
- **Gate explícito:** `if (kind === "canvas") { renderStrokesOnTop(nodes); }`.

### Backend
Nenhum. Mudanças no payload são aditivas (campo `group` opcional, backward compat).

### Frontend

**Arquivos a tocar:**
- `frontend/src/components/editors/GraphEditor.jsx` — implementar marquee, agrupamento, snap.
- `frontend/src/lib/graph.js` — funções puras:
  - `isInMarquee(node, marqueeRect)`
  - `groupNodes(nodes) → {groupId, childIds}`
  - `snapToGrid(position, gridSize=20, threshold=8)`
  - `findAlignmentGuides(node, allNodes, threshold=5)`

**Estrutura de group no payload:**
```js
// node.group = "g_abc123" → faz parte do grupo g_abc123
// edges que conectam nodes do mesmo grupo seguem o grupo ao mover
```

**Marquee UI:**
```jsx
{marqueeState && (
  <rect
    x={marqueeState.x1} y={marqueeState.y1}
    width={marqueeState.x2 - marqueeState.x1}
    height={marqueeState.y2 - marqueeState.y1}
    fill="rgba(79, 70, 229, 0.1)"
    stroke="#4F46E5"
    strokeDasharray="4 4"
  />
)}
```

**Snap implementation:**
```js
function snapToGrid(value, gridSize = 20, threshold = 8) {
  const snapped = Math.round(value / gridSize) * gridSize;
  return Math.abs(snapped - value) < threshold ? snapped : value;
}
```

### Critérios de aceitação
- [ ] No canvas E no diagrama, ferramenta V + drag em área vazia cria marquee.
- [ ] Marquee seleciona nodes em ambos os tipos.
- [ ] No canvas, marquee também seleciona strokes dentro da área.
- [ ] Ctrl+G agrupa nodes, Ctrl+Shift+G desagrupa — funciona em ambos.
- [ ] Mover nó-pai move filhos juntos — funciona em ambos.
- [ ] Snap-to-grid: arrastar nó a <8px de linha do grid encaixa — funciona em ambos.
- [ ] Guia vermelha aparece quando alinhado com outro nó — funciona em ambos.
- [ ] **Gate mantido só para diferenciais exclusivos:** strokes/borracha/z-axis só no canvas; validação UML só no diagrama.
- [ ] Strokes continuam renderizando por cima das formas (z-axis preservado) — só canvas.
- [ ] Undo/redo reverte todas as ações de grupo/marquee/snap em ambos.

### Validação
```bash
cd frontend && npm run lint
# manual: canvas → V → marquee → Ctrl+G → mover grupo → Ctrl+Z → undo ok
# diagrama: verificar que features não aparecem
```

---

## F8 — Slides (modo apresentação de notas via `---`)

### Contexto
Notas com `---` (separador markdown padrão) viram apresentação fullscreen. Sem novo tipo de documento, sem editor novo — só modo de leitura.

### O que muda
- Botão "Apresentar" no header do editor de notas (`kind === "note"`).
- Entra em modo fullscreen via `requestFullscreen()`.
- Divide conteúdo pelos `---`, mostra 1 slide por vez.
- Navegação: `←` `→` (anterior/próximo), `Espaço` (próximo), `Esc` (sair).
- Cada slide centralizado, fonte grande (48px+), fundo limpo.
- Indicador discreto: `3 / 12` no canto inferior.
- Suporta blocos de código com syntax highlight.

### Backend
Nenhum. Renderização é só frontend.

### Frontend

**Arquivos novos:**
- `frontend/src/components/presenter/SlideView.jsx` — renderiza 1 slide.
- `frontend/src/components/presenter/SlideShow.jsx` — controla navegação, fullscreen.
- `frontend/src/components/presenter/SlideControls.jsx` — overlay discreto.
- `frontend/src/hooks/useFullscreen.js` — wrapper de Fullscreen API.

**Arquivos a tocar:**
- `frontend/src/pages/DocumentEditor.jsx` — botão "Apresentar" no header (só para `kind === "note"`).

**Parsing de `---`:**
```js
function parseSlides(content) {
  // Separar por linha que contém só ---
  const lines = content.split("\n");
  const slides = [[]];
  for (const line of lines) {
    if (/^---+\s*$/.test(line.trim())) {
      slides.push([]);
    } else {
      slides[slides.length - 1].push(line);
    }
  }
  return slides.map(s => s.join("\n").trim()).filter(Boolean);
}
```

### Critérios de aceitação
- [ ] Botão "Apresentar" só aparece em notas.
- [ ] Nota sem `---` mostra 1 slide único com todo conteúdo.
- [ ] Nota com 3 `---` mostra 3 slides navegáveis.
- [ ] Espaço avança, ← volta, Esc sai do fullscreen.
- [ ] Indicador `N / Total` visível mas discreto.
- [ ] Código com syntax highlight renderiza corretamente em slide.

### Validação
```bash
cd frontend && npm run lint
# manual: nota com `---` → Apresentar → navegar slides → Esc
```

---

# 📦 Release 4 — IA Fundação

## F9 — IA setup por usuário (key própria)

### Contexto
Cada user cola a própria API key em Settings → Integrações → IA. Sem key = sem IA. App continua 100%.

**Provedores suportados (v1):** OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, Mistral, DeepSeek, NVIDIA NIM, 9router, Ollama (local), Custom endpoint.

### Backend

**Arquivos a tocar:**
- `backend/users/models.py` — adicionar campos em `UserPreferences`:
  ```python
  AI_PROVIDER_CHOICES = [
      ("openrouter", "OpenRouter"),
      ("openai", "OpenAI"),
      ("anthropic", "Anthropic"),
      ("gemini", "Google Gemini"),
      ("groq", "Groq"),
      ("mistral", "Mistral"),
      ("deepseek", "DeepSeek"),
      ("nvidia", "NVIDIA NIM"),
      ("9router", "9router"),
      ("ollama", "Ollama (local)"),
      ("custom", "Custom endpoint"),
  ]
  AI_STATUS_CHOICES = [("unchecked", "Não verificada"), ("valid", "Válida"), ("invalid", "Inválida")]
  
  ai_provider = models.CharField(max_length=20, choices=AI_PROVIDER_CHOICES, blank=True)
  ai_api_key_encrypted = models.BinaryField(blank=True, null=True)
  ai_model = models.CharField(max_length=120, blank=True)
  ai_base_url = models.CharField(max_length=255, blank=True)  # para ollama/custom
  ai_validated_at = models.DateTimeField(null=True, blank=True)
  ai_status = models.CharField(max_length=10, choices=AI_STATUS_CHOICES, default="unchecked")
  ai_last_error = models.TextField(blank=True)
  ```

**Migration:**
```python
class Migration(migrations.Migration):
    dependencies = [("users", "0001_initial")]
    operations = [
        migrations.AddField(model_name="userpreferences", name="ai_provider", field=models.CharField(blank=True, choices=[...], max_length=20)),
        migrations.AddField(model_name="userpreferences", name="ai_api_key_encrypted", field=models.BinaryField(blank=True, null=True)),
        migrations.AddField(model_name="userpreferences", name="ai_model", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="userpreferences", name="ai_base_url", field=models.CharField(blank=True, max_length=255)),
        migrations.AddField(model_name="userpreferences", name="ai_validated_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="userpreferences", name="ai_status", field=models.CharField(choices=[("unchecked", "Não verificada"), ("valid", "Válida"), ("invalid", "Inválida")], default="unchecked", max_length=10)),
        migrations.AddField(model_name="userpreferences", name="ai_last_error", field=models.TextField(blank=True)),
    ]
```

**Novo app:** `backend/ai/`

```
backend/ai/
├── __init__.py
├── apps.py
├── crypto.py          # Fernet encrypt/decrypt
├── providers/
│   ├── __init__.py
│   ├── base.py        # Interface comum
│   ├── openrouter.py
│   ├── openai.py
│   ├── anthropic.py
│   ├── gemini.py
│   ├── groq.py
│   ├── mistral.py
│   ├── deepseek.py
│   ├── nvidia.py
│   ├── nine_router.py
│   ├── ollama.py
│   └── custom.py
├── views.py           # endpoints
├── urls.py
├── prompts.py         # system prompts por operação
├── decorators.py      # @ai_required
└── tests.py
```

**`backend/ai/crypto.py`:**
```python
from cryptography.fernet import Fernet
from django.conf import settings
import base64
import hashlib

def _get_fernet_key() -> bytes:
    """Deriva uma chave Fernet a partir do SECRET_KEY do Django."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(digest)

def encrypt_key(plaintext: str) -> bytes:
    return Fernet(_get_fernet_key()).encrypt(plaintext.encode())

def decrypt_key(ciphertext: bytes) -> str:
    return Fernet(_get_fernet_key()).decrypt(bytes(ciphertext)).decode()
```

**`backend/ai/providers/base.py`:**
```python
from abc import ABC, abstractmethod

class AIProvider(ABC):
    name: str = ""
    
    @abstractmethod
    def validate(self, api_key: str, base_url: str = "") -> tuple[bool, list[str] | str]:
        """Retorna (is_valid, models_list_or_error)."""
        ...
    
    @abstractmethod
    def chat(self, api_key: str, messages: list, model: str, base_url: str = "", **opts) -> str:
        """Envia mensagens, retorna resposta completa (sync)."""
        ...
    
    @abstractmethod
    def stream(self, api_key: str, messages: list, model: str, base_url: str = "", **opts):
        """Generator que yield chunks de resposta."""
        ...
```

**`backend/ai/providers/openrouter.py` (exemplo):**
```python
import httpx
from .base import AIProvider

class OpenRouterProvider(AIProvider):
    name = "openrouter"
    base_url = "https://openrouter.ai/api/v1"
    
    def validate(self, api_key: str, base_url: str = "") -> tuple[bool, list[str] | str]:
        try:
            r = httpx.get(
                f"{base_url or self.base_url}/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
            if r.status_code == 200:
                models = [m["id"] for m in r.json().get("data", [])]
                return True, models
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
        except Exception as e:
            return False, str(e)
    
    def chat(self, api_key: str, messages: list, model: str, base_url: str = "", **opts) -> str:
        r = httpx.post(
            f"{base_url or self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, **opts},
            timeout=60,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    
    def stream(self, api_key: str, messages: list, model: str, base_url: str = "", **opts):
        with httpx.stream(
            "POST",
            f"{base_url or self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "stream": True, **opts},
            timeout=60,
        ) as r:
            for line in r.iter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    import json
                    chunk = json.loads(line[6:])
                    delta = chunk["choices"][0].get("delta", {}).get("content", "")
                    if delta:
                        yield delta
```

**Endpoints (`backend/ai/views.py`):**
```python
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from users.models import UserPreferences
from .crypto import encrypt_key, decrypt_key
from .providers import get_provider
from .decorators import ai_required

class AIStatusView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        prefs, _ = UserPreferences.objects.get_or_create(user=request.user)
        return Response({
            "configured": bool(prefs.ai_api_key_encrypted),
            "provider": prefs.ai_provider,
            "model": prefs.ai_model,
            "status": prefs.ai_status,
            "validated_at": prefs.ai_validated_at,
            "last_error": prefs.ai_last_error if prefs.ai_status == "invalid" else "",
            "models": [],  # cachear últimos models conhecidos
        })


class AIValidateView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        provider_name = request.data.get("provider")
        api_key = request.data.get("api_key")
        base_url = request.data.get("base_url", "")
        model = request.data.get("model", "")
        
        provider = get_provider(provider_name)
        if not provider:
            return Response({"valid": False, "error": "Provedor desconhecido"}, status=400)
        
        is_valid, result = provider.validate(api_key, base_url)
        
        prefs, _ = UserPreferences.objects.get_or_create(user=request.user)
        prefs.ai_provider = provider_name
        prefs.ai_api_key_encrypted = encrypt_key(api_key) if is_valid else None
        prefs.ai_base_url = base_url
        prefs.ai_model = model or (result[0] if is_valid and result else "")
        prefs.ai_validated_at = timezone.now() if is_valid else None
        prefs.ai_status = "valid" if is_valid else "invalid"
        prefs.ai_last_error = "" if is_valid else (result if isinstance(result, str) else "")
        prefs.save()
        
        return Response({
            "valid": is_valid,
            "models": result if is_valid and isinstance(result, list) else [],
            "error": "" if is_valid else (result if isinstance(result, str) else ""),
        })


class AISettingsView(APIView):
    permission_classes = [IsAuthenticated]
    
    def patch(self, request):
        """Atualiza provider/model/base_url (sem trocar a key)."""
        prefs, _ = UserPreferences.objects.get_or_create(user=request.user)
        for field in ["provider", "model", "base_url"]:
            if field in request.data:
                setattr(prefs, f"ai_{field}", request.data[field])
        prefs.save()
        return Response({"ok": True})
```

**`backend/ai/decorators.py`:**
```python
from functools import wraps
from rest_framework.response import Response
from rest_framework import status
from users.models import UserPreferences

def ai_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        prefs = UserPreferences.objects.filter(user=request.user).first()
        if not prefs or prefs.ai_status != "valid":
            return Response({
                "error": "ia_not_configured",
                "message": "Configure sua chave de API em Settings → Integrações → IA",
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return view_func(request, *args, **kwargs)
    return wrapper
```

### Frontend

**Arquivos novos:**
- `frontend/src/components/ai/SettingsIA.jsx` — UI completa de configuração.

**Arquivos a tocar:**
- `frontend/src/pages/Settings.jsx` (ou similar) — incluir `<SettingsIA/>`.
- `frontend/src/lib/api.js` — helpers `aiValidate()`, `aiGetStatus()`, `aiSaveSettings()`.

**UI SettingsIA:**
```jsx
function SettingsIA() {
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [status, setStatus] = useState({ status: "unchecked" });
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Carregar status inicial
  useEffect(() => { fetchStatus(); }, []);
  
  async function handleValidate() {
    setLoading(true);
    const res = await api.post("/ai/validate/", { provider, api_key: apiKey, model, base_url: baseUrl });
    setStatus({ status: res.data.valid ? "valid" : "invalid", last_error: res.data.error });
    setModels(res.data.models || []);
    setLoading(false);
  }
  
  return (
    <div>
      <select value={provider} onChange={e => setProvider(e.target.value)}>
        <option value="">— Escolha —</option>
        <option value="openrouter">OpenRouter</option>
        {/* ... */}
     </select>
      
      <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
      
      {provider === "ollama" || provider === "custom" ? (
        <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
      ) : null}
      
      <button onClick={handleValidate} disabled={loading}>
        {loading ? "Validando..." : "Validar agora"}
     </button>
      
      <StatusIndicator status={status} />
      
      {models.length > 0 && (
        <select value={model} onChange={e => setModel(e.target.value)}>
          <option value="">Auto (melhor</option>
          {models.slice(0, 50).map(m => <option key={m} value={m}>{m</option>)}
       </select>
      )}
   </div>
  );
}
```

### Critérios de aceitação
- [ ] Migration aplica sem erro. Banco abre normalmente.
- [ ] Sem key configurada: `/api/ai/status/` retorna `configured: false`.
- [ ] Validar key OpenAI fake: retorna `valid: false` com erro legível.
- [ ] Validar key OpenAI real: retorna `valid: true` com lista de models.
- [ ] Key criptografada no banco (inspecionar `db.sqlite3` mostra blob binário).
- [ ] Tentar `/api/ai/ask/` sem key válida: retorna 503 com mensagem.
- [ ] UI SettingsIA mostra indicador visual correto (verde/vermelho/cinza).
- [ ] Provider Ollama: campo `base_url` aparece e é obrigatório.

### Validação
```bash
cd backend && python manage.py makemigrations
cd backend && python manage.py migrate
cd backend && python manage.py test ai.tests --keepdb
cd frontend && npm run lint
# manual: Settings → IA → escolher provedor → colar key → validar
```

---

## F10 — IA: endpoints funcionais

### Contexto
Com a key configurada (F9), expor os endpoints que o frontend consome. Todos sob `/api/ai/`, todos com `@ai_required` (exceto `/validate/` e `/status/`).

### Backend

**Endpoints em `backend/ai/views.py`:**

```python
@ai_required
class AIAskView(APIView):
    """POST /api/ai/ask/"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        prompt = request.data.get("prompt")
        context = request.data.get("context", {})  # {document_id, selection, kind}
        messages = self._build_messages(prompt, context, request.user)
        return self._call_provider(request.user, messages)


@ai_required
class AIEditView(APIView):
    """POST /api/ai/edit/ — retorna diff preview."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        document_id = request.data.get("document_id")
        instruction = request.data.get("instruction")
        selection = request.data.get("selection")
        doc = Document.objects.filter(id=document_id, owner=request.user).first()
        if not doc:
            return Response({"error": "not_found"}, status=404)
        
        before = selection or doc.content
        messages = [
            {"role": "system", "content": EDIT_SYSTEM_PROMPT},
            {"role": "user", "content": f"INSTRUÇÃO: {instruction}\n\nTEXTO:\n{before}"},
        ]
        after = self._call_provider_sync(request.user, messages)
        return Response({
            "before": before,
            "after": after,
            "summary": f"Aplicar mudança em {len(before)} caracteres?",
        })


@ai_required
class AIGenerateView(APIView):
    """POST /api/ai/generate/ — cria documento do prompt."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        kind = request.data.get("kind")
        prompt = request.data.get("prompt")
        folder_id = request.data.get("folder_id")
        messages = [
            {"role": "system", "content": GENERATE_SYSTEM_PROMPT.format(kind=kind)},
            {"role": "user", "content": prompt},
        ]
        raw = self._call_provider_sync(request.user, messages)
        # Validar raw conforme schema do kind
        # Criar Document se folder_id informado
        return Response({"payload": raw, "kind": kind})


@ai_required
class AIPlanView(APIView):
    """POST /api/ai/plan/ — quebra meta em tarefas."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        goal = request.data.get("goal")
        deadline = request.data.get("deadline")
        messages = [
            {"role": "system", "content": PLAN_SYSTEM_PROMPT},
            {"role": "user", "content": f"META: {goal}\nPRAZO: {deadline or 'sem prazo'}"},
        ]
        raw = self._call_provider_sync(request.user, messages)
        tasks = parse_task_list(raw)  # extrai lista JSON
        return Response({"tasks": tasks})


@ai_required
class AISearchView(APIView):
    """POST /api/ai/search/ — busca semântica."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        query = request.data.get("query")
        # Por enquanto: usar FTS5 nativo + reranking opcional com IA
        docs = Document.objects.filter(
            owner=request.user,
            deleted_at__isnull=True,
        ).filter(
            Q(title__icontains=query) | Q(search_text__icontains=query)
        )[:20]
        return Response({"results": [serialize_doc(d) for d in docs]})


@ai_required
class AISummarizeView(APIView):
    """POST /api/ai/summarize/ — resume documento."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        document_id = request.data.get("document_id")
        max_length = request.data.get("max_length", 300)
        doc = Document.objects.filter(id=document_id, owner=request.user).first()
        if not doc:
            return Response({"error": "not_found"}, status=404)
        
        text = doc.search_text or doc.content
        messages = [
            {"role": "system", "content": SUMMARIZE_SYSTEM_PROMPT.format(max_length=max_length)},
            {"role": "user", "content": text[:20000]},  # limite seguro
        ]
        summary = self._call_provider_sync(request.user, messages)
        return Response({"summary": summary})


@ai_required
class AITranslateView(APIView):
    """POST /api/ai/translate/ — traduz mantendo termos técnicos."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        document_id = request.data.get("document_id")
        target_lang = request.data.get("target_lang", "en")
        preserve_technical = request.data.get("preserve_technical", True)
        doc = Document.objects.filter(id=document_id, owner=request.user).first()
        if not doc:
            return Response({"error": "not_found"}, status=404)
        
        text = request.data.get("selection") or doc.content
        messages = [
            {"role": "system", "content": TRANSLATE_SYSTEM_PROMPT.format(
                target_lang=target_lang, preserve_technical=preserve_technical
            )},
            {"role": "user", "content": text},
        ]
        translated = self._call_provider_sync(request.user, messages)
        return Response({"translated": translated})


@ai_required
class AIAutoTagView(APIView):
    """POST /api/ai/auto-tag/ — sugere tags/categoria."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        document_id = request.data.get("document_id")
        doc = Document.objects.filter(id=document_id, owner=request.user).first()
        if not doc:
            return Response({"error": "not_found"}, status=404)
        
        text = doc.search_text or doc.content
        messages = [
            {"role": "system", "content": AUTOTAG_SYSTEM_PROMPT},
            {"role": "user", "content": text[:10000]},
        ]
        raw = self._call_provider_sync(request.user, messages)
        suggestions = parse_tag_suggestions(raw, request.user)  # extrai JSON
        return Response({"tags": suggestions["tags"], "category_id": suggestions.get("category_id")})


@ai_required
class AIBacklinksView(APIView):
    """POST /api/ai/backlinks/ — encontra notas relacionadas."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        document_id = request.data.get("document_id")
        threshold = request.data.get("threshold", 0.3)
        doc = Document.objects.filter(id=document_id, owner=request.user).first()
        if not doc:
            return Response({"error": "not_found"}, status=404)
        
        # Implementação simples: extrair keywords via IA, buscar docs com FTS5
        keywords = self._extract_keywords(doc.search_text or doc.content, request.user)
        related = Document.objects.filter(
            owner=request.user,
            deleted_at__isnull=True,
        ).exclude(id=doc.id).filter(
            Q(title__icontains=keywords[0]) | Q(search_text__icontains=keywords[0])
        )[:10]
        return Response({"backlinks": [serialize_doc(d) for d in related], "keywords": keywords})
```

**`backend/ai/prompts.py` (exemplos):**
```python
ASK_SYSTEM_PROMPT = """Você é um assistente integrado ao Notefy, um app de notas local-first. Responda de forma concisa e técnica. Use o contexto fornecido (documento aberto, seleção) para dar respostas relevantes. Se não souber, diga. Responda em português."""

EDIT_SYSTEM_PROMPT = """Você é um editor de texto no Notefy. Aplique a instrução do usuário no texto fornecido. Retorne APENAS o texto editado, sem explicações, sem aspas, sem markdown."""

GENERATE_SYSTEM_PROMPT = """Você é um gerador de conteúdo para o Notefy. Crie o payload JSON válido para um documento do tipo {kind}. Siga o schema:
- note: {{"sections": [{{"id": "s1", "type": "text", "html": "..."}}]}}
- spreadsheet: {{"columns": [...], "rows": [...]}}
- diagram: {{"nodes": [...], "edges": [...]}}
- canvas: {{"nodes": [...], "edges": [...], "strokes": [...]}}

Retorne APENAS o JSON, sem markdown, sem explicações."""

SUMMARIZE_SYSTEM_PROMPT = """Resuma o texto a seguir em no máximo {max_length} caracteres. Use português claro e direto. Foque nos pontos principais."""

TRANSLATE_SYSTEM_PROMPT = """Traduza o texto para {target_lang}. {'Mantenha termos técnicos não traduzidos.' if preserve_technical else ''} Retorne APENAS a tradução."""

AUTOTAG_SYSTEM_PROMPT = """Analise o texto e sugira até 5 tags relevantes e uma categoria (se identificar). Retorne JSON:
{{"tags": ["tag1", "tag2"], "category": "Nome da Categoria"}}

Tags devem ser curtas (1-3 palavras). Use categorias existentes se possível."""

PLAN_SYSTEM_PROMPT = """Quebre a meta em tarefas concretas. Retorne JSON:
{{"tasks": [{{"title": "...", "starts_at": "YYYY-MM-DDTHH:MM:SS", "priority": 0-3}}, ...]}}

Se não houver prazo, distribua as tarefas em dias próximos."""

BACKLINKS_SYSTEM_PROMPT = """Extraia as 5 palavras-chave mais importantes do texto. Retorne JSON: {{"keywords": ["palavra1", ...]}}"""
```

### Critérios de aceitação
- [ ] Cada endpoint valida `@ai_required` (retorna 503 sem key válida).
- [ ] `/api/ai/ask/` com prompt simples retorna resposta coerente.
- [ ] `/api/ai/edit/` retorna `before`/`after` que podem ser diffed no frontend.
- [ ] `/api/ai/generate/` retorna JSON válido conforme schema do `kind`.
- [ ] `/api/ai/plan/` retorna lista de tarefas parseáveis.
- [ ] `/api/ai/summarize/` retorna texto menor que `max_length`.

### Validação
```bash
cd backend && python manage.py test ai.tests --keepdb
# teste manual: cada endpoint com curl + key válida
```

---

## F11 — IA: 5 acessos no frontend

### Contexto
5 acessos fixos pra não confundir o user:
1. `/` no corpo de notas → menu contextual.
2. `Ctrl+J` → sidebar persistente (chat).
3. `Ctrl+K` → busca + pergunta (spotlight-like).
4. Botão direito → ações de seleção.
5. FAB (botão flutuante) → fallback.

### Frontend

**Arquivos novos:**
- `frontend/src/components/ai/AISidebar.jsx` — chat lateral.
- `frontend/src/components/ai/AIMenuSlash.jsx` — menu `/` em notas.
- `frontend/src/components/ai/AISpotlight.jsx` — modal `Ctrl+K`.
- `frontend/src/components/ai/AIContextMenu.jsx` — submenu botão direito.
- `frontend/src/components/ai/AIFab.jsx` — botão flutuante.
- `frontend/src/components/ai/AIDiffPreview.jsx` — modal de confirmação de edição.
- `frontend/src/hooks/useAI.js` — wrapper de chamadas IA.

**Arquivos a tocar:**
- `frontend/src/context/UIContext.jsx` — estado da sidebar IA, FAB visibility.
- `frontend/src/components/editors/NoteEditor.jsx` — hook de `/`, hook de Ctrl+Shift+A.
- `frontend/src/components/ui/ContextMenu.jsx` — submenu IA condicional.

**Gating global:** antes de mostrar qualquer elemento de IA, checar `aiStatus.status === "valid"`. Se não, esconder.

```jsx
function withAI(Component) {
  return function AIWrapper(props) {
    const [status, setStatus] = useState(null);
    useEffect(() => { api.get("/ai/status/").then(r => setStatus(r.data)); }, []);
    
    if (!status || status.status !== "valid") {
      return <AIUnavailable message="Configure IA em Settings → Integrações" />;
    }
    return <Component {...props} />;
  };
}
```

**Slash menu:**
```jsx
function AIMenuSlash({ onCommand }) {
  const commands = [
    { id: "summarize", label: "Resumir nota", icon: "📝" },
    { id: "expand", label: "Expandir conteúdo", icon: "✨" },
    { id: "rewrite", label: "Reescrever tom formal", icon: "🖊" },
    { id: "translate", label: "Traduzir (EN)", icon: "🌐" },
    { id: "continue", label: "Continuar de onde parei", icon: "→" },
    { id: "code", label: "Gerar seção de código", icon: "💻" },
    { id: "explain", label: "Explicar trecho", icon: "💡" },
  ];
  return (
    <div className="ai-slash-menu">
      {commands.map(c => (
        <button key={c.id} onClick={() => onCommand(c.id)}>
          {c.icon} {c.label}
       </button>
      ))}
   </div>
  );
}
```

### Critérios de aceitação
- [ ] Sem IA configurada: nenhum dos 5 elementos aparece.
- [ ] Com IA válida: todos os 5 acessos funcionam.
- [ ] `/` no editor abre menu contextual com comandos relevantes ao `kind`.
- [ ] `Ctrl+J` abre/fecha sidebar. Estado persiste entre navegações.
- [ ] `Ctrl+K` abre spotlight com input + lista de resultados.
- [ ] Botão direito em texto selecionado mostra submenu IA.
- [ ] FAB abre sidebar.
- [ ] Diff preview antes de aplicar edição: botão "Aplicar" / "Cancelar".

### Validação
```bash
cd frontend && npm run lint
cd frontend && npm run build
# manual: cada um dos 5 acessos com IA válida
```

---

# 📦 Release 5 — IA Avançada

## F12 — Auto-tag, backlinks, batch

### Contexto
Features "inteligentes" que rodam sob comando ou em signal post-save.

### Backend

**Signal post-save para auto-tag:**
```python
# backend/content/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Document
from ai.tasks import suggest_tags_async  # se tiver Celery, senão on-save direto

@receiver(post_save, sender=Document)
def suggest_tags_on_save(sender, instance, created, **kwargs):
    if not created or instance.kind != "note":
        return
    # chamar IA assincronamente ou em background thread
    # salvar em instance.data["suggested_tags"] sem sobrescrever tags existentes
```

**Endpoints:**
- `POST /api/ai/batch/` — recebe `{items: [ids], instruction: str}`, retorna plano de ação.

### Frontend
- Banner "IA sugere: tag1, tag2" no editor de nota após save.
- Rodapé de backlinks: "X notas relacionadas".
- Batch action em `Library`: "Reorganize por tema", "Gere índice".

---

## 📋 Resumo executivo

| ID | Feature | Prioridade | Complexidade | Release |
|----|---------|------------|--------------|---------|
| F1 | Favoritos unificados | 🔴 alta | 🟢 baixa | R1 |
| F2 | Tema independente canvas/diagrama | 🟢 média | 🟢 baixa | R1 |
| F3 | Caneta/borracha/marca-texto | 🔴 alta | 🟢 baixa | R1 |
| F4 | Workspace VS Code | 🟡 média-alta | 🟡 média | R2 |
| F5 | Preview nativo | 🟡 média | 🟡 média | R2 |
| F6 | Export ZIP | 🟡 média | 🟠 média-alta | R3 |
| F7 | Canvas E Diagrama melhorados | 🟢 média | 🟠 média-alta | R3 |
| F8 | Slides | 🟡 média | 🟢 baixa | R3 |
| F9 | IA setup | 🟠 alta | 🟡 média | R4 |
| F10 | IA endpoints | 🟠 alta | 🟠 média-alta | R4 |
| F11 | IA 5 acessos | 🟡 média | 🟠 média-alta | R4 |
| F12 | IA avançada | 🟢 baixa | 🟠 média-alta | R5 |

---

n## 🚨 Notas finais pra você, agent

- **Não misture releases.** Faça R1 inteiro, valide, commita. Depois R2.
- **Não crie abstrações "para o futuro".** Implemente o que cada feature pede. Se precisar de helper, crie inline.
- **Comente o código não-óbvio.** Estilo: `# marca a coluna atual; ORDER BY -updated_at quebra em PostgreSQL mas funciona em SQLite`.
- **Se quebrar um teste existente, conserte antes de seguir.** Não ignore teste vermelho.
- **Não invente APIs.** Se o `README.md` ou o `ROADMAP.md` não descrever uma API, ela não existe.
- **Se tiver dúvida entre duas abordagens, escolha a mais simples e comente a alternativa.** `ponytail: comment explaining the ceiling and upgrade path`.
- **Para cada feature, faça commit com mensagem clara:** `git commit -m "F3: canvas pen/highlighter/eraser size controls"`.
- **Ao terminar um release, atualize o README** com changelog resumido.

Boa codada. 🚀
