import { memo } from 'react'
import { estiloDaCamada } from '@/lib/design'

/**
 * Uma camada do Design como elemento HTML.
 *
 * Só desenha: quem seleciona, arrasta e edita é o `DesignEditor`, que acha
 * a camada pelo `data-camada`. O `memo` funciona porque a árvore é
 * imutável: mexer num retângulo não redesenha a tela inteira.
 *
 * O texto mora num filho próprio (`data-texto`), que o editor torna
 * editável no duplo clique. A `key` com o texto remonta esse filho quando
 * a edição termina: o navegador mexeu nos nós de texto enquanto a pessoa
 * digitava, e o React não pode reaproveitar os dele.
 */
const DesignNode = memo(function DesignNode({ camada, pai }) {
  if (camada.visible === false) return null
  const estilo = estiloDaCamada(camada, pai)
  if (camada.type === 'text') {
    return (
      <div data-camada={camada.id} style={estilo}>
        <div key={camada.text} data-texto="" style={{ outline: 'none', minWidth: 1, minHeight: '1em' }}>
          {camada.text}
        </div>
      </div>
    )
  }
  return (
    <div data-camada={camada.id} style={estilo}>
      {camada.children?.map((filho) => (
        <DesignNode key={filho.id} camada={filho} pai={camada} />
      ))}
    </div>
  )
})

export default DesignNode

/**
 * O que o palco zera do app em volta: sem isto a entrelinha, a cor e o
 * espaçamento de letras da interface vazariam para dentro do desenho, e a
 * tela sairia diferente na exportação (que não está dentro do app).
 */
export const BASE_DO_PALCO = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: 16,
  lineHeight: 'normal',
  letterSpacing: 'normal',
  color: '#000000',
  textAlign: 'left',
}

/** As camadas do topo de uma página, no espaço do quadro. */
export const CamadasDaPagina = memo(function CamadasDaPagina({ camadas }) {
  return camadas.map((camada) => <DesignNode key={camada.id} camada={camada} pai={null} />)
})
