/**
 * Uma planilha em CSV.
 *
 * O separador e o decimal seguem o idioma do app, porque é assim que o
 * Excel lê: em português ele espera ponto e vírgula e vírgula decimal
 * ("7,5"). Com vírgula e ponto, o arquivo abria inteiro na coluna A, e
 * "7.5" podia virar data.
 */

import { valorParaExportar } from './formula.js'

export const formatoDoCsv = (lingua) =>
  /^pt/i.test(lingua ?? '') ? { separador: ';', decimal: ',' } : { separador: ',', decimal: '.' }

/**
 * Texto que o Excel leria como fórmula ao abrir o .csv (`=cmd|...`, `@SUM(...)`): vai com um
 * apóstrofo na frente. Número escrito como texto ("-5", "+3,2") fica como está.
 */
const lidoComoFormula = (texto) => /^[=+\-@\t\r]/.test(texto) && !/^[-+]?\d+([.,]\d+)?$/.test(texto)

export function planilhaEmCsv(columns, rows, { separador = ',', decimal = '.' } = {}) {
  const celula = (valor) => {
    let texto = typeof valor === 'number' ? String(valor).replace('.', decimal) : String(valor ?? '')
    if (typeof valor !== 'number' && lidoComoFormula(texto)) texto = `'${texto}`
    return texto.includes(separador) || texto.includes('"') || /[\r\n]/.test(texto)
      ? `"${texto.replace(/"/g, '""')}"`
      : texto
  }
  const cabecalho = columns.map((c) => celula(c.name)).join(separador)
  // O valor calculado, e não o texto da fórmula: `=B1*2` no .csv não
  // significa nada fora daqui.
  const linhas = rows.map((row) => columns.map((c) => celula(valorParaExportar(c, row, columns, rows))).join(separador))
  return [cabecalho, ...linhas].join('\r\n')
}
