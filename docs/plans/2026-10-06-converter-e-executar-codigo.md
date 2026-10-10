# Converter arquivos e executar código na nota: plano de implementação

> **Status (2026-10-06): implementado, com estas mudanças em relação ao plano.** O plano abaixo fica como registro; o que vale é o código e o README.
>
> - **D1/D2: sem Office.** Nem LibreOffice nem pdf2docx. A conversão faz só o que o app já carrega: imagens entre PNG, JPG, WEBP, GIF, BMP e TIFF, e imagem, TXT, MD e HTML para PDF (`backend/content/conversao.py`). Markdown vai para o PDF como texto.
> - **D4: `input()` e `prompt()` funcionam.** O worker espera a resposta com requisição síncrona a `/api/entrada/` (`backend/core/entrada.py`); sem SharedArrayBuffer nem COOP/COEP.
> - **Um worker só** (`frontend/src/lib/executar/worker.js`) para as duas linguagens, vivo entre execuções do mesmo bloco, em vez de um por linguagem.
> - **Sem tempo limite automático.** Parar encerra o worker, e a saída para sozinha passando de 100 mil caracteres.
> - **Pacotes Python** (numpy, pandas...) vêm do CDN oficial da mesma versão quando o código os importa. Só o núcleo vai no app.
> - **Também:** "Converter" no cabeçalho da tela do arquivo aberto, e o aviso de sucesso abre o arquivo convertido.

> **Para o Claude:** executar tarefa por tarefa, na ordem. Cada tarefa termina com testes verdes e lint limpo. Commit só quando a pessoa pedir.

**Objetivo:** (1) "Converter para ▸" no botão direito de todo arquivo, com os pares de formato que o app sabe converter; (2) botão ▶ no cabeçalho do bloco de código da nota, ativo para JavaScript e Python, com a saída num painel embaixo do código.

**Arquitetura:**
- **Conversão:** roda no **servidor** (Django). Uma tabela única de conversores diz quem converte o quê, e com qual motor: Pillow, xhtml2pdf ou LibreOffice. O servidor cria um **arquivo novo** na mesma pasta e nunca mexe no original. O frontend só pergunta "para onde dá para converter este arquivo?" (um campo do serializer) e chama uma rota.
- **Execução de código:** roda no **navegador**, num Web Worker isolado. JavaScript usa o motor do próprio navegador; Python usa o Pyodide (CPython em WebAssembly). Nenhum código de usuário roda no servidor. A saída não é salva na nota.

**Tecnologias:** Django/DRF, Pillow e xhtml2pdf (já instalados), LibreOffice headless (opcional, detectado), React, Web Worker do Vite e `pyodide` (npm).

---

## Decisões que precisam de você antes de começar

| # | Decisão | Recomendação | Por quê |
|---|---|---|---|
| D1 | **Motor do Office** (docx→pdf, pptx→pdf, xlsx→pdf, docx↔odt…) | **LibreOffice opcional, detectado.** Com ele instalado, as opções aparecem; sem ele, "Converter" mostra só o que dá e uma linha "Instale o LibreOffice para converter documentos do Office" desativada. | Não existe conversor Office→PDF em Python puro com qualidade. Embutir o LibreOffice no instalador custa ~350 MB. O Word via COM só funciona com o Office instalado e só no Windows. Nesta máquina o LibreOffice **não** está instalado. |
| D2 | **PDF→DOCX** | **Fora da primeira entrega**, ou usar `pdf2docx` se a licença servir. | O `pdf2docx` depende do PyMuPDF, que é **AGPL**: distribuir o app fechado com ele obriga a abrir o código. O LibreOffice "converte" PDF→DOCX, mas sai um desenho, não um texto editável. Pode virar um aviso de "limitado". |
| D3 | **Onde mora o Pyodide** | **Junto do app** (`public/pyodide/`, ~12 MB, carregado só no primeiro ▶). | Funciona offline no desktop. O CDN deixa o build menor, mas exige internet e sai do controle do app. |
| D4 | **`input()` em Python / `prompt()` em JS** | **Sem suporte na v1**: erro com mensagem clara. | Entrada interativa num worker exige `SharedArrayBuffer` e cabeçalhos COOP/COEP, que quebram outras partes do app. |

Alternativa mais curta (*ponytail lite*):
- **Conversão:** fazer só o que não precisa do LibreOffice (imagens e texto→PDF).
- **Código:** só JavaScript primeiro.

As duas metades deste plano já vêm em fases que permitem parar aí.

---

## Matriz de conversão (v1)

| Origem | Destinos | Motor |
|---|---|---|
| png, jpg/jpeg, webp, bmp, gif, tiff | as outras imagens da lista e pdf | Pillow |
| txt, md | pdf (texto preservado, fonte mono) | xhtml2pdf |
| html | pdf | xhtml2pdf |
| docx, doc, odt, rtf | pdf, docx, odt | LibreOffice |
| pptx, ppt, odp | pdf, pptx, odp | LibreOffice |
| xlsx, xls, ods, csv | pdf, xlsx, ods | LibreOffice |
| pdf | docx (só se D2 = sim) | pdf2docx |

Regras gerais:
- **O próprio formato nunca é destino.** jpg e jpeg contam como o mesmo formato.
- **Imagem com transparência → jpg:** a transparência vira fundo branco.
- **GIF animado:** só o primeiro quadro.

---

## Fase A — Conversão de arquivos

### Tarefa A1: tirar `titulo_livre` do app de IA

O nome sem colisão ("relatorio (2).pdf") vai servir à conversão também, e `content` não deve importar de `ai`.

**Arquivos:**
- Criar: `backend/content/nomes.py`
- Modificar: `backend/ai/views.py:122` (apagar a função e importar de `content.nomes`)
- Teste: os existentes em `backend/ai/test_run.py` cobrem o comportamento.

**Passo 1:** mover a função como está para `content/nomes.py` e trocar o `def` em `ai/views.py` por `from content.nomes import titulo_livre`.

**Passo 2:** rodar `cd backend && .venv/Scripts/python.exe manage.py test ai` e conferir que passa.

### Tarefa A2: a tabela de conversores

**Arquivos:**
- Criar: `backend/content/conversao.py`
- Teste: `backend/content/test_conversao.py`

**Passo 1, teste que falha:**

```python
from io import BytesIO
from unittest import mock

from django.test import SimpleTestCase
from PIL import Image

from content import conversao


class DestinosTests(SimpleTestCase):
    def test_imagem_vai_para_as_outras_imagens_e_pdf(self):
        destinos = conversao.destinos("foto.PNG")
        self.assertIn("jpg", destinos)
        self.assertIn("pdf", destinos)
        self.assertNotIn("png", destinos)

    def test_office_some_sem_libreoffice(self):
        with mock.patch.object(conversao, "soffice", return_value=None):
            self.assertEqual(conversao.destinos("relatorio.docx"), [])
            self.assertTrue(conversao.falta_motor("relatorio.docx"))

    def test_office_aparece_com_libreoffice(self):
        with mock.patch.object(conversao, "soffice", return_value="soffice"):
            self.assertEqual(conversao.destinos("aula.pptx"), ["pdf", "odp"])

    def test_formato_desconhecido(self):
        self.assertEqual(conversao.destinos("dados.xyz"), [])


class ConverterTests(SimpleTestCase):
    def test_png_transparente_vira_jpg_com_fundo_branco(self):
        origem = BytesIO()
        Image.new("RGBA", (4, 4), (255, 0, 0, 0)).save(origem, "PNG")
        saida = conversao.converter(origem.getvalue(), "a.png", "jpg")
        img = Image.open(BytesIO(saida))
        self.assertEqual(img.format, "JPEG")
        self.assertEqual(img.getpixel((0, 0)), (255, 255, 255))

    def test_texto_vira_pdf(self):
        saida = conversao.converter("olá\n  recuado".encode(), "n.txt", "pdf")
        self.assertTrue(saida.startswith(b"%PDF"))

    def test_par_invalido(self):
        with self.assertRaises(conversao.NaoConverte):
            conversao.converter(b"x", "a.png", "docx")
```

**Passo 2:** `manage.py test content.test_conversao` → falha (o módulo não existe).

**Passo 3, implementação:**

```python
"""Conversão de arquivos: quem converte o quê, e com qual motor.

Uma tabela só (`_PARES`) responde às duas perguntas do app: para onde um
arquivo pode ir (`destinos`, que o menu usa) e como chegar lá
(`converter`, que a rota usa). O LibreOffice é opcional e detectado: sem
ele, os pares do Office somem do menu em vez de falhar no clique.
"""
import os
import shutil
import subprocess
import tempfile
from functools import lru_cache
from html import escape
from io import BytesIO
from pathlib import Path

from PIL import Image

IMAGENS = ("png", "jpg", "webp", "bmp", "gif", "tiff")
_PILLOW = {"png": "PNG", "jpg": "JPEG", "webp": "WEBP", "bmp": "BMP", "gif": "GIF", "tiff": "TIFF", "pdf": "PDF"}
_SINONIMOS = {"jpeg": "jpg", "tif": "tiff"}
_GRUPOS_OFFICE = (
    (("docx", "doc", "odt", "rtf"), ("pdf", "docx", "odt")),
    (("pptx", "ppt", "odp"), ("pdf", "pptx", "odp")),
    (("xlsx", "xls", "ods", "csv"), ("pdf", "xlsx", "ods")),
)
TEMPO_LIMITE = 120  # segundos para o LibreOffice


class NaoConverte(Exception):
    """Par de formatos que o app não converte."""


class FaltaMotor(Exception):
    """O par existe, mas o programa que o converte não está instalado."""


def extensao(nome):
    ext = Path(nome).suffix.lower().lstrip(".")
    return _SINONIMOS.get(ext, ext)


@lru_cache(maxsize=1)
def soffice():
    """Caminho do LibreOffice, ou None. `NOTEFY_SOFFICE` ganha da busca."""
    candidatos = [
        os.environ.get("NOTEFY_SOFFICE"),
        shutil.which("soffice"),
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ]
    return next((c for c in candidatos if c and Path(c).exists()), None)


def _pares():
    """(origem, destino) -> motor. Recalculado a cada chamada: é barato e acompanha o LibreOffice."""
    pares = {}
    for origem in IMAGENS:
        for destino in (*IMAGENS, "pdf"):
            if destino != origem:
                pares[(origem, destino)] = "pillow"
    for origem in ("txt", "md", "html"):
        pares[(origem, "pdf")] = "xhtml2pdf"
    for origens, destinos in _GRUPOS_OFFICE:
        for origem in origens:
            for destino in destinos:
                if destino != origem:
                    pares[(origem, destino)] = "libreoffice"
    return pares


def destinos(nome):
    """Formatos para os quais este arquivo pode ir agora, na ordem do menu."""
    origem = extensao(nome)
    return [
        destino
        for (o, destino), motor in _pares().items()
        if o == origem and (motor != "libreoffice" or soffice())
    ]


def falta_motor(nome):
    """O arquivo é do Office e o LibreOffice não está aqui."""
    origem = extensao(nome)
    return not soffice() and any(o == origem and m == "libreoffice" for (o, _), m in _pares().items())


def converter(conteudo, nome, destino):
    """Bytes de `nome` -> bytes no formato `destino`."""
    origem = extensao(nome)
    motor = _pares().get((origem, destino))
    if motor is None:
        raise NaoConverte(f"{origem} → {destino}")
    if motor == "pillow":
        return _por_pillow(conteudo, destino)
    if motor == "xhtml2pdf":
        return _por_xhtml2pdf(conteudo, origem)
    if not soffice():
        raise FaltaMotor()
    return _por_libreoffice(conteudo, origem, destino)


def _por_pillow(conteudo, destino):
    img = Image.open(BytesIO(conteudo))
    img.seek(0)  # GIF animado: o primeiro quadro
    if destino in ("jpg", "pdf", "bmp") and img.mode in ("RGBA", "LA", "P"):
        fundo = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        fundo.paste(rgba, mask=rgba.getchannel("A"))
        img = fundo
    saida = BytesIO()
    img.save(saida, _PILLOW[destino])
    return saida.getvalue()


def _por_xhtml2pdf(conteudo, origem):
    from xhtml2pdf import pisa

    texto = conteudo.decode("utf-8", errors="replace")
    html = texto if origem == "html" else (
        f'<pre style="font-family: Courier; font-size: 10pt; white-space: pre-wrap">{escape(texto)}</pre>'
    )
    saida = BytesIO()
    if pisa.CreatePDF(html, dest=saida, encoding="utf-8").err:
        raise NaoConverte("xhtml2pdf")
    return saida.getvalue()


def _por_libreoffice(conteudo, origem, destino):
    # Perfil próprio por chamada: duas conversões ao mesmo tempo no mesmo
    # perfil travam uma à outra (o LibreOffice tranca o diretório).
    with tempfile.TemporaryDirectory() as pasta:
        entrada = Path(pasta) / f"entrada.{origem}"
        entrada.write_bytes(conteudo)
        perfil = Path(pasta, "perfil").as_uri()
        subprocess.run(
            [soffice(), f"-env:UserInstallation={perfil}", "--headless", "--norestore",
             "--convert-to", destino, "--outdir", pasta, str(entrada)],
            check=True, capture_output=True, timeout=TEMPO_LIMITE,
        )
        saida = Path(pasta) / f"entrada.{destino}"
        if not saida.exists():
            raise NaoConverte(f"{origem} → {destino}")
        return saida.read_bytes()
```

**Passo 4:** rodar o teste e conferir que passa. O LibreOffice entra num teste à parte com `@skipUnless(conversao.soffice(), ...)`, que converte um docx gerado pelo próprio LibreOffice (odt→docx→pdf).

### Tarefa A3: a rota e o campo do serializer

**Arquivos:**
- Modificar: `backend/content/views.py`, nova action ao lado de `extract` (~linha 386)
- Modificar: `backend/content/serializers.py` (campo `conversoes`)
- Teste: `backend/content/test_conversao.py`, classe `ConverterRotaTests(APITestCase)`

**Testes:**
- `POST /api/documents/<id>/convert/ {"para": "jpg"}` num png cria um **documento novo** (`kind=file`) na **mesma pasta**, com nome `foto.jpg`. Se `foto.jpg` já existir, o nome é `foto (2).jpg`. O original fica intacto. Resposta 201 com o documento.
- Par inválido → 400 "Este arquivo não converte para DOCX."
- Office sem LibreOffice → 503 "Instale o LibreOffice para converter documentos do Office." (texto via `texto()`, pt/en).
- Documento que não é arquivo → 400; de outro usuário → 404.
- O serializer de um png traz `conversoes == ["jpg", "webp", ...]`; o de uma nota traz `[]`.
- Falha do LibreOffice (`CalledProcessError` ou `TimeoutExpired`) → 422 "Não foi possível converter este arquivo." O servidor não cai.

**Implementação (resumo):**
- **Rota:** a action `convert` lê o arquivo (`doc.file.open("rb")`), chama `conversao.converter`, monta o nome com `titulo_livre` e cria `Document(kind="file", folder=doc.folder, owner=request.user, title=..., file=ContentFile(bytes, name=...))`. Ao salvar, o próprio modelo preenche mime, `file_kind` e tamanho.
- **Limite de tamanho:** reaproveitar `settings.MAX_UPLOAD_SIZE` na saída.
- **Serializer:** `conversoes = SerializerMethodField()`, que devolve `conversao.destinos(obj.original_name or obj.title)` se `obj.kind == "file"` e `[]` nos outros casos. Mais o campo `conversao_precisa_libreoffice = conversao.falta_motor(...)`.
- **Documentação da API:** registrar no `drf-spectacular` e acrescentar uma linha na tabela de endpoints do README.

### Tarefa A4: aviso de sucesso

**Arquivos:**
- Modificar: `frontend/src/lib/avisoFlutuante.js` (`avisarSucesso(texto, id)`)
- Modificar: `frontend/src/components/layout/Notificacoes.jsx` (ícone `CheckCircle2` verde para `tipo: 'sucesso'`, mesma duração do erro)

O resultado da conversão aparece no mesmo cartão que dizia "Convertendo…", agora como "foto.jpg criado em Viagens".

### Tarefa A5: "Converter para ▸" no botão direito

**Arquivos:**
- Modificar: `frontend/src/components/DocumentCard.jsx` (`documentMenuItems`, ~linha 206): ganha `onConvert`
- Modificar: `frontend/src/hooks/useDocumentActions.jsx` (função `converter(doc, destino)`, que passa `onConvert` para o menu)

**Comportamento:**
- **Onde aparece:** submenu "Converter para", logo depois de "Exportar", só para `kind === 'file'`, com um item por destino, em maiúsculas ("PDF", "DOCX").
- **Sem LibreOffice:** se `doc.conversao_precisa_libreoffice` e não há destinos, aparece um item desativado: "Instale o LibreOffice para converter".
- **Ao clicar:** `avisarProgresso('converter', 'Convertendo para PDF…')`, `POST /convert/`, `avisarSucesso(...)` com o mesmo id, `done()` (recarrega as listas pelo `notefy:moved`). Em caso de erro, `avisarErro(extractError(err), 'converter')`.
- **Telas:** vale em todas as que usam `buildMenu` (Arquivos, Recentes, Busca, Pasta, Início) e no menu do visualizador de arquivo, que deve usar o mesmo.

**Verificação no navegador** (cópia isolada do banco):
- png → jpg cria o arquivo na pasta e mostra o aviso de sucesso;
- txt → pdf abre no visualizador;
- docx sem LibreOffice mostra o item desativado.

### Tarefa A6: traduções, docs, empacotamento

- **en-US:** as frases novas (o teste `i18n.test.mjs` aponta as que faltarem).
- **README:** uma linha na seção da API e uma no Frontend (LibreOffice opcional e onde instalar).
- **`notefy-server.spec`:** nada a mudar (Pillow e xhtml2pdf já entram). O LibreOffice é externo, e `NOTEFY_SOFFICE` aceita um caminho portátil.
- **Android (cliente da nuvem):** a conversão roda no servidor, então funciona igual.

---

## Fase B — ▶ nos blocos de código

### Tarefa B1: o núcleo de JavaScript, testável sem navegador

**Arquivos:**
- Criar: `frontend/src/lib/executar/javascript.js`
- Teste: `frontend/src/lib/executar/javascript.test.mjs`

**Teste que falha:**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { rodarJavascript, formatar } from './javascript.js'

const coletar = async (codigo) => {
  const linhas = []
  const fim = await rodarJavascript(codigo, (tipo, texto) => linhas.push([tipo, texto]))
  return { linhas, fim }
}

test('console.log vira linha de saída', async () => {
  const { linhas, fim } = await coletar('console.log(1 + 1, "oi")')
  assert.deepEqual(linhas, [['saida', '2 oi']])
  assert.equal(fim.ok, true)
})

test('await no nível de cima funciona', async () => {
  const { linhas } = await coletar('const x = await Promise.resolve(3); console.log(x)')
  assert.deepEqual(linhas, [['saida', '3']])
})

test('erro sai como linha de erro, com a mensagem', async () => {
  const { linhas, fim } = await coletar('null.x')
  assert.equal(fim.ok, false)
  assert.equal(linhas.at(-1)[0], 'erro')
  assert.match(linhas.at(-1)[1], /TypeError/)
})

test('objetos saem legíveis', () => {
  assert.equal(formatar({ a: [1, 2] }), '{"a":[1,2]}')
  assert.equal(formatar(undefined), 'undefined')
})
```

**Implementação:**

```js
/** Valor do console.log como texto: string crua, o resto em JSON (ou String se circular). */
export function formatar(valor) {
  if (typeof valor === 'string') return valor
  if (valor === undefined || typeof valor === 'function' || typeof valor === 'symbol') return String(valor)
  try { return JSON.stringify(valor) ?? String(valor) } catch { return String(valor) }
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

/** Roda o código com um `console` que manda cada linha para `emitir(tipo, texto)`. */
export async function rodarJavascript(codigo, emitir) {
  const linha = (tipo) => (...args) => emitir(tipo, args.map(formatar).join(' '))
  const console = { log: linha('saida'), info: linha('saida'), warn: linha('aviso'), error: linha('erro') }
  try {
    await new AsyncFunction('console', codigo)(console)
    return { ok: true }
  } catch (err) {
    emitir('erro', err?.stack?.split('\n')[0] ?? String(err))
    return { ok: false }
  }
}
```

### Tarefa B2: workers e o executor

**Arquivos:**
- Criar: `frontend/src/lib/executar/javascript.worker.js` (recebe `{codigo}`, chama `rodarJavascript`, devolve `{tipo, texto}` e no fim `{fim}`)
- Criar: `frontend/src/lib/executar/python.worker.js` (Pyodide: carrega uma vez e reaproveita; cada execução usa um `globals` novo; `setStdout`/`setStderr` → linhas; `input()` levanta "Entrada de texto não é suportada aqui.")
- Criar: `frontend/src/lib/executar/index.js`

API de `index.js`:

```js
export const EXECUTAVEIS = ['javascript', 'python']
export const podeExecutar = (linguagem) => EXECUTAVEIS.includes(linguagem)

/**
 * Executa e devolve { parar, fim }. `emitir(tipo, texto)` recebe cada linha.
 * Tempo-limite (`LIMITE_MS`) e "Parar" encerram o worker; o Python recarrega
 * na próxima execução.
 */
export function executar(linguagem, codigo, emitir) { /* new Worker(new URL('./javascript.worker.js', import.meta.url), { type: 'module' }) */ }
```

Detalhes:
- `LIMITE_MS`: 10 s para JS. Para Python, 30 s depois de carregado; o primeiro carregamento não conta no tempo, mas mostra "Carregando o Python…".
- **Pyodide (D3):** `npm i pyodide`, mais um `scripts/copiar-pyodide.mjs` chamado em `postinstall` que copia `pyodide.asm.js`, `pyodide.asm.wasm`, `python_stdlib.zip` e `pyodide-lock.json` para `public/pyodide/`. O `.gitignore` ignora essa pasta. No worker: `loadPyodide({ indexURL: '/pyodide/' })`.
- **Segurança:** o worker não tem DOM nem `localStorage`, então o JWT não é alcançável. Um `fetch` do código sai sem autenticação, o que é aceitável: o código é do próprio usuário. A CSP do Tauri continua `null`, sem mudança.

### Tarefa B3: o botão ▶ e o painel de saída

**Arquivos:**
- Modificar: `frontend/src/components/editors/CodeSection.jsx` (cabeçalho, ~linha 182: botão antes de Recolher/Copiar; painel depois do `<pre>`)
- Criar: `frontend/src/components/editors/SaidaDoCodigo.jsx`

**Comportamento:**
- **Botão:** ícone `Play`, no canto superior direito do cabeçalho, junto de Recolher/Copiar.
  - Ativo para `javascript` e `python`.
  - Nas outras linguagens fica **desativado e cinza**, com o title "Só JavaScript e Python rodam aqui".
  - Rodando, vira `Square` (Parar) com `aria-label` "Parar".
- **Atalho:** Ctrl+Enter dentro do código executa.
- **Painel:** embaixo do código.
  - Cada linha em `font-mono`; `erro` em vermelho e `aviso` em âmbar.
  - O rodapé diz "Concluído em 12 ms", "Terminou com erro", "Parado" ou "Tempo esgotado (10 s)".
  - Um X fecha o painel.
  - Executar de novo limpa a saída anterior.
  - Limite de 1000 linhas; acima disso aparece "… saída cortada".
- **Bloco recolhido:** executar expande o bloco.
- **Nota em somente leitura:** ▶ funciona, porque executar não muda a nota.
- **O que não muda:** a saída **não** é salva; o formato do bloco (`content/schemas.py`) não muda.

### Tarefa B4: traduções, docs e verificação

- **en-US:** "Executar (Ctrl+Enter)", "Parar", "Só JavaScript e Python rodam aqui", "Carregando o Python…", "Concluído em {ms} ms", "Terminou com erro", "Tempo esgotado ({s} s)", "Entrada de texto não é suportada aqui.", "… saída cortada", "Fechar saída".
- **README:** uma linha na seção Nota ("blocos de JavaScript e Python executam no próprio navegador, isolados").
- **Verificação no navegador** (cópia isolada):
  - JS: `console.log` simples, um erro com a linha, um laço infinito que para em 10 s, e o botão Parar;
  - Python: `print`, uma exceção com traceback, um `import math`, e uma segunda execução sem recarregar o Pyodide;
  - qualquer outra linguagem com o ▶ desativado.

---

## O que fica de fora da v1 (e quando adicionar)

- **PDF→DOCX:** quando a licença do D2 for resolvida.
- **PDF→imagens por página:** junto do PDF→DOCX (mesmo motor).
- **Converter vários de uma vez:** quando alguém pedir; o lote já existe em `lib/lote.js`.
- **`input()` interativo e gráficos do matplotlib na saída:** depois que o ▶ básico for usado.
- **Outras linguagens (C, Java):** só com isolamento no servidor (contêiner) e nunca no servidor compartilhado do SharePoint sem isso.
