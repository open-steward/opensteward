/**
 * Loja Integrada product (GET /v1/produto, GET /v1/produto/{produto_id}) →
 * canonical Product.
 *
 * Field names are those of the specification's documented examples
 * (https://api-docs.lojaintegrada.com.br/openapi/API-Loja-Integrada.json).
 * The list answer carries `id`, `nome`, `apelido`, `descricao_completa`,
 * `ativo`, `removido`, `sku`, `tipo`, `url`; the single-product answer adds
 * `imagens` (each with `id`, `grande`, `posicao`), `data_criacao`,
 * `data_modificacao` and the price and stock fields.
 *
 * Not mapped, for want of a documented source:
 *  - variants: a variation is its own child product (see `isVariationChild`),
 *    and a canonical variant needs a price currency the API never states;
 *  - `status` other than ARCHIVED/ACTIVE: `ativo: false` is not documented as
 *    a draft, so no status is claimed for it;
 *  - `vendor`: `marca` is only a URI (`"/api/v1/marca/20507618"`);
 *  - timestamps: naive local times in an undocumented zone (see `zonedIso`).
 */
import { Slug } from '@opensteward/shared'
import type { Product } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { requireId, text, zonedIso } from '../util'

export interface RawLojaIntegradaImagem {
  id?: number
  grande?: string | null
  posicao?: string | null
  principal?: boolean
}

export interface RawLojaIntegradaProduto {
  id: number
  nome?: string | null
  apelido?: string | null
  descricao_completa?: string | null
  ativo?: boolean
  removido?: boolean
  sku?: string | null
  /** "normal" (simple), "atributo" (parent) or "atributo_opcao" (variation child). */
  tipo?: string | null
  url?: string | null
  imagens?: RawLojaIntegradaImagem[]
  data_criacao?: string | null
  data_modificacao?: string | null
  [key: string]: unknown
}

/**
 * POST /v1/produto: "Para criar um produto filho é preciso preencher na chave
 * **tipo** o valor **atributo_opcao**." — and "O produto pai agrupa as
 * variações e os produtos filhos representam as variações." GET /v1/produto
 * lists children beside their parents (its example holds both), so a child
 * is a variation, not a product of its own.
 */
export function isVariationChild(raw: RawLojaIntegradaProduto): boolean {
  return raw.tipo === 'atributo_opcao'
}

function toImage(raw: RawLojaIntegradaImagem): Image | undefined {
  const url = text(raw.grande)
  if (!url) return undefined
  const position = raw.posicao != null ? Number(raw.posicao) : NaN
  return {
    ...(raw.id !== undefined ? { id: String(raw.id) } : {}),
    url,
    ...(Number.isInteger(position) && position >= 0 ? { position } : {}),
  }
}

export function transformProduto(raw: RawLojaIntegradaProduto): Product {
  const id = requireId(raw.id, 'product')
  const title = text(raw.nome)
  if (!title) throw new Error(`Loja Integrada product ${id} has no nome`)
  const handle = Slug.safeParse(raw.apelido)
  const images = (raw.imagens ?? []).map(toImage).filter((i): i is Image => i !== undefined)
  const createdAt = zonedIso(raw.data_criacao)
  const updatedAt = zonedIso(raw.data_modificacao)
  return {
    id,
    title,
    ...(text(raw.descricao_completa) ? { description: raw.descricao_completa as string } : {}),
    ...(handle.success ? { handle: handle.data } : {}),
    ...(raw.removido === true
      ? { status: 'ARCHIVED' as const }
      : raw.ativo === true
        ? { status: 'ACTIVE' as const }
        : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    metadata: { ...raw },
  }
}
