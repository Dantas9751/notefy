/**
 * Faixa e validação dos campos de data e hora.
 *
 * O seletor nativo aceita coisas que o `Date` não representa: 31 de
 * fevereiro, ano 0000. O `toISOString()` então lança, o erro cai no catch
 * genérico e o usuário lê "não foi possível salvar a data", sem saber o
 * que corrigir. Aqui a checagem acontece antes, com mensagem que diz o
 * problema.
 */

export const ANO_MIN = 1900
export const ANO_MAX = 2200
export const DATA_MIN = `${ANO_MIN}-01-01T00:00`
export const DATA_MAX = `${ANO_MAX}-12-31T23:59`

/** Mensagem do problema na data, ou `null` quando ela serve. */
export function erroDeData(valor, rotulo = 'A data') {
  if (!valor) return null

  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) {
    return `${rotulo} não é válida. Confira o dia e o mês.`
  }

  // O `Date` NÃO recusa 31 de fevereiro: ele rola para 3 de março. Salvar
  // caladamente num dia que a pessoa não escolheu é pior do que recusar,
  // então o dia é conferido contra o que foi digitado.
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor))
  if (partes) {
    const [, ano, mes, dia] = partes.map(Number)
    const rolou =
      data.getFullYear() !== ano ||
      data.getMonth() + 1 !== mes ||
      data.getDate() !== dia
    if (rolou) {
      return `${rotulo} não existe no calendário. Confira o dia e o mês.`
    }
  }

  const ano = data.getFullYear()
  if (ano < ANO_MIN || ano > ANO_MAX) {
    return `${rotulo} precisa estar entre ${ANO_MIN} e ${ANO_MAX}.`
  }
  return null
}

/**
 * Valida início e fim juntos, na ordem em que o usuário lê o formulário.
 * Devolve a primeira mensagem encontrada, ou `null`.
 */
export function erroDoPeriodo(inicio, fim) {
  const problema =
    erroDeData(inicio, 'A data de início') ?? erroDeData(fim, 'A data de fim')
  if (problema) return problema

  if (inicio && fim && new Date(fim) < new Date(inicio)) {
    return 'O fim não pode ser antes do início.'
  }
  return null
}
