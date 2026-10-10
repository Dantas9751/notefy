import { buscarArquivo } from '@/lib/fileMedia'
import { uniao } from '@/lib/design'
import { t } from '@/lib/i18n'
import DesignNode, { BASE_DO_PALCO } from './DesignNode'

/**
 * Exportação do Design: PNG, JPG e SVG.
 *
 * As camadas são desenhadas fora da vista pelo MESMO `DesignNode` da tela
 * e o HTML resultante vai para dentro de um `<foreignObject>`: o que sai é
 * o que se vê, sem um segundo desenhista para manter igual. O PNG é esse
 * SVG pintado num canvas.
 *
 * ponytail: o SVG guarda HTML, então abre em navegador e no próprio app mas
 * não vira vetor editável no Illustrator. Um conversor camada→<rect>/<text>
 * resolve, se um dia for preciso editar o SVG fora daqui.
 * ponytail: sombra que vaza da caixa da camada é cortada na borda.
 */

/** `camadas`: as do topo, com `x`/`y` na página. Devolve um Blob. */
export async function exportarCamadas(camadas, { formato = 'png', escala = 1, fundo = null } = {}) {
  const visiveis = camadas.filter((c) => c.visible !== false)
  if (!visiveis.length) throw new Error(t('Não há nada visível para exportar.'))
  const caixa = uniao(visiveis.map((c) => ({ x: c.x, y: c.y, w: Math.max(1, c.w), h: Math.max(1, c.h) })))
  const html = await desenharFora(visiveis, caixa, fundo)
  const largura = Math.ceil(caixa.w)
  const altura = Math.ceil(caixa.h)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">` +
    `<foreignObject x="0" y="0" width="${largura}" height="${altura}">${html}</foreignObject></svg>`
  if (formato === 'svg') return new Blob([svg], { type: 'image/svg+xml' })
  return rasterizar(svg, largura, altura, escala, formato === 'jpg' ? 'image/jpeg' : 'image/png', formato === 'jpg' ? fundo ?? '#FFFFFF' : fundo)
}

/** A página inteira (o "Exportar" do menu do item). */
export function exportarPagina(pagina, ext) {
  return exportarCamadas(pagina?.children ?? [], { formato: ext, escala: ext === 'svg' ? 1 : 2, fundo: pagina?.background ?? null })
}

async function desenharFora(camadas, caixa, fundo) {
  const [{ createRoot }, { flushSync }] = await Promise.all([import('react-dom/client'), import('react-dom')])
  const hospede = document.createElement('div')
  hospede.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none'
  hospede.setAttribute('aria-hidden', 'true')
  document.body.appendChild(hospede)
  const raiz = createRoot(hospede)
  try {
    flushSync(() =>
      raiz.render(
        // O XMLSerializer põe o `xmlns` do XHTML sozinho.
        <div
          style={{ ...BASE_DO_PALCO, position: 'relative', overflow: 'hidden', width: caixa.w, height: caixa.h, background: fundo ?? 'transparent' }}
        >
          <div style={{ position: 'absolute', left: -caixa.x, top: -caixa.y }}>
            {camadas.map((c) => (
              <DesignNode key={c.id} camada={c} pai={null} />
            ))}
          </div>
        </div>,
      ),
    )
    const raizHtml = hospede.firstElementChild
    await embutirImagens(raizHtml)
    return new XMLSerializer().serializeToString(raizHtml)
  } finally {
    raiz.unmount()
    hospede.remove()
  }
}

/**
 * Imagem dentro de SVG-como-imagem não carrega nada de fora: cada
 * `url(...)` vira data URL antes de serializar.
 */
async function embutirImagens(raiz) {
  const elementos = [raiz, ...raiz.querySelectorAll('[style*="url("]')].filter((el) => el.getAttribute('style')?.includes('url('))
  const cache = new Map()
  for (const el of elementos) {
    let estilo = el.getAttribute('style')
    for (const [, endereco] of estilo.matchAll(/url\("?([^")]+)"?\)/g)) {
      if (endereco.startsWith('data:')) continue
      if (!cache.has(endereco)) cache.set(endereco, await paraDataUrl(endereco).catch(() => null))
      const dado = cache.get(endereco)
      if (dado) estilo = estilo.split(endereco).join(dado)
    }
    el.setAttribute('style', estilo)
  }
}

async function paraDataUrl(endereco) {
  const { data } = await buscarArquivo(endereco, 'blob')
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(leitor.result)
    leitor.onerror = reject
    leitor.readAsDataURL(data)
  })
}

function rasterizar(svg, largura, altura, escala, tipo, fundo) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(largura * escala))
    canvas.height = Math.max(1, Math.round(altura * escala))
    const ctx = canvas.getContext('2d')
    if (fundo) {
      ctx.fillStyle = fundo
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    const imagem = new Image()
    imagem.onload = () => {
      ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('Não foi possível gerar a imagem.')))), tipo, 0.92)
    }
    imagem.onerror = () => reject(new Error(t('Não foi possível ler o desenho.')))
    // Data URL, e não blob URL: com blob o canvas fica "tainted" em parte dos navegadores.
    imagem.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}
