/**
 * Tetos de tamanho das seções de uma nota.
 *
 * ESPELHO de `backend/content/schemas.py` (`MAX_ITENS_SECAO` e
 * `MAX_COLUNAS_TABELA`). Os números vivem nos dois lados porque o
 * backend precisa deles para RECUSAR e o editor precisa deles para
 * IMPEDIR — e impedir é o que importa para o usuário: passando do teto,
 * o autosave leva 400 e o documento simplesmente para de ser gravado
 * enquanto a pessoa continua digitando.
 *
 * Servir os números por uma rota nova só para isso seria máquina demais
 * para dois inteiros que quase nunca mudam. O que impede eles de
 * divergirem é um teste do backend que lê este arquivo e compara —
 * `backend/content/test_limites.py`. Mudou aqui e não lá, a suíte
 * reclama.
 */

/** Itens de um checklist, ou linhas de uma tabela. */
export const MAX_ITENS_SECAO = 500

/** Colunas de uma tabela dentro de uma nota. */
export const MAX_COLUNAS_TABELA = 30
