import { useState } from 'react'
import { PanelTop, Plus } from 'lucide-react'
import ColorWheel from '@/components/ui/ColorWheel'
import { Faixa, amostraDaTinta, ehFerramentaDeTraco, ferramentasDo } from './BarraDoQuadro'
import { semMouse } from '@/lib/desktop'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

/**
 * As ferramentas em coluna, à esquerda do quadro: a outra forma de mostrar o
 * que a `BarraDoQuadro` mostra no alto. Mesmas ferramentas e mesmos
 * controles, só que à mostra em vez de em menus — o catálogo de formas do
 * diagrama (UML, ER...) lê melhor assim.
 */
export default function PaletaLateral({
  isCanvas,
  tool,
  onTool,
  cores,
  espessuras,
  tinta,
  onTinta,
  larguras,
  onLarguras,
  opacidade,
  onOpacidade,
  raio,
  onRaio,
  palette,
  onAdicionar,
  conector,
  onConector,
  onParaTopo,
}) {
  //: Grupos de formas abertos. Conjunto, e não um id só: o "Conteúdo" e o
  //: "Formas" não disputam a mesma vaga — colar um post-it e um retângulo
  //: pede os dois abertos lado a lado.
  const [abertos, setAbertos] = useState(() => new Set([palette.groups[0]?.id]))
  const ehTraco = ehFerramentaDeTraco(tool)

  return (
    <>
      <div className="flex items-center justify-between px-1 pb-1.5">
        <p className="secao">{t('Ferramentas')}</p>
        <button
          type="button"
          onClick={onParaTopo}
          title={t('Ferramentas no topo')}
          aria-label={t('Ferramentas no topo')}
          className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
        >
          <PanelTop size={13} />
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1">
        {ferramentasDo(isCanvas)
          .flat()
          .map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.titulo}
              aria-label={item.titulo}
              aria-pressed={tool === item.id}
              onClick={() => onTool(item.id)}
              className={cn(
                'flex items-center justify-center rounded-md p-2 transition',
                tool === item.id ? 'bg-accent-600 text-white' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800',
              )}
            >
              <item.icon size={14} />
            </button>
          ))}
      </div>

      {isCanvas && (
        <>
          <p className="px-1 pb-1.5 pt-4 secao">{t('Tinta')}</p>
          <div className="flex flex-wrap gap-1.5 px-1">
            {cores.map((cor) => (
              <button
                key={cor}
                type="button"
                onClick={() => onTinta(cor)}
                style={amostraDaTinta(cor, cores).style}
                aria-label={amostraDaTinta(cor, cores).rotulo}
                title={amostraDaTinta(cor, cores).rotulo}
                className={cn('h-6 w-6 rounded-full border-2 transition hover:scale-110', amostraDaTinta(cor, cores).className, tinta === cor ? 'border-accent-500' : 'border-transparent')}
              />
            ))}
            <ColorWheel value={tinta} onChange={onTinta} selected={!cores.includes(tinta)} className="h-6 w-6" title={t('Tinta personalizada')} />
          </div>

          {ehTraco && (
            <>
              <p className="px-1 pb-1 pt-3 text-[10px] text-ink-400">{t('Espessura')}</p>
              <div className="flex flex-wrap gap-1 px-1">
                {espessuras.map((largura) => (
                  <button
                    key={largura}
                    type="button"
                    title={t('Espessura {width}', { width: largura })}
                    aria-label={t('Espessura {width}', { width: largura })}
                    aria-pressed={larguras[tool] === largura}
                    onClick={() => onLarguras({ ...larguras, [tool]: largura })}
                    className={cn(
                      'inline-flex h-7 min-w-7 items-center justify-center rounded-md transition',
                      larguras[tool] === largura ? 'bg-accent-600 text-white' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800',
                    )}
                  >
                    <span className="rounded-full bg-current" style={{ width: Math.min(largura, 12), height: Math.min(largura, 12) }} />
                  </button>
                ))}
              </div>
            </>
          )}
          {tool === 'highlighter' && (
            <div className="pt-3">
              <Faixa rotulo={t('Opacidade')} min={10} max={80} valor={opacidade} sufixo="%" onMudar={onOpacidade} className="flex-1" />
            </div>
          )}
          {tool === 'eraser' && (
            <div className="pt-3">
              <Faixa rotulo={t('Raio')} min={10} max={80} valor={raio} sufixo="px" onMudar={onRaio} className="flex-1" />
            </div>
          )}
        </>
      )}

      <p className="px-1 pb-1.5 pt-4 secao">{t('Formas')}</p>
      {palette.groups.map((group) => {
        const aberto = abertos.has(group.id)
        return (
          <div key={group.id} className="mb-1">
            <button
              type="button"
              onClick={() =>
                setAbertos((atual) => {
                  const copia = new Set(atual)
                  if (copia.has(group.id)) copia.delete(group.id)
                  else copia.add(group.id)
                  return copia
                })
              }
              aria-expanded={aberto}
              className="flex w-full items-center justify-between rounded px-1.5 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              {group.label}
              <Plus size={11} className={cn('transition-transform', aberto && 'rotate-45')} />
            </button>
            {aberto && (
              <div className="space-y-0.5 pt-0.5">
                {Object.entries(group.types).map(([type, preset]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onAdicionar(type)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <p className="px-1 pb-1.5 pt-4 secao">{t('Conector')}</p>
      {palette.edgeGroups.map((group) => (
        <div key={group.label} className="mb-2">
          {palette.edgeGroups.length > 1 && <p className="px-1.5 py-0.5 secao">{group.label}</p>}
          {Object.entries(group.types).map(([type, preset]) => (
            <button
              key={type}
              type="button"
              onClick={() => onConector(type)}
              className={cn(
                'flex w-full items-center rounded-md px-2 py-1 text-left text-xs transition',
                conector === type
                  ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                  : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ))}

      <p className="mt-3 rounded bg-ink-50 p-2 text-[10px] leading-relaxed text-ink-400 dark:bg-ink-800/60">
        {t('Arraste para mover. Puxe a bolinha para conectar e o quadradinho para redimensionar. Duplo clique edita.')}{' '}
        {semMouse()
          ? t('Toque e segure um objeto para duplicar ou excluir. Os botões no canto dão zoom e desfazem.')
          : t('Ctrl+roda dá zoom. Ctrl+arrastar marca vários. Delete apaga, Ctrl+C/Ctrl+V copia e cola. Botão direito duplica ou exclui.')}
      </p>
    </>
  )
}
