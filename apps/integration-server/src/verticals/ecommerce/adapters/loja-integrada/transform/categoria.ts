/**
 * Loja Integrada category (GET /v1/categoria, GET /v1/categoria/{categoria_id})
 * → canonical Collection.
 *
 * GET /v1/categoria: "**objects**: lista das categorias, com `id`, `nome`,
 * `descricao`, `id_externo`, `url`, `seo` e `categoria_pai`." `url` is a full
 * storefront URL, not a slug, so it stays in `metadata` with the rest.
 */
import type { Collection } from '../../../schema/collection'
import { requireId, text } from '../util'

export interface RawLojaIntegradaCategoria {
  id: number
  nome?: string | null
  descricao?: string | null
  id_externo?: number | null
  url?: string | null
  seo?: string | null
  categoria_pai?: string | null
  [key: string]: unknown
}

export function transformCategoria(raw: RawLojaIntegradaCategoria): Collection {
  const id = requireId(raw.id, 'category')
  const title = text(raw.nome)
  if (!title) throw new Error(`Loja Integrada category ${id} has no nome`)
  const description = text(raw.descricao)
  return {
    id,
    title,
    ...(description ? { description } : {}),
    metadata: { ...raw },
  }
}
