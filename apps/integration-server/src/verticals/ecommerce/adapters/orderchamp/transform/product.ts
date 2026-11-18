/**
 * Orderchamp Product + ProductVariant transforms.
 *
 * Field confidence: `id`, `title` (a doc section is literally titled "Get
 * the titles of a product's first five variants"), `sku`,
 * `inventoryQuantity` / `inventoryPolicy` (both named verbatim in
 * https://developers.orderchamp.com/manage-inventory) and
 * `externalProductId` / `externalProductVariantId` (named verbatim in
 * https://developers.orderchamp.com/manage-products) are quoted in the
 * public docs. `price { amount currencyCode }` is NOT quoted anywhere in
 * the scraped docs (the actual query/mutation code blocks are rendered
 * client-side and were not capturable) — it is inferred from the `Money`
 * and `CurrencyCode` types both existing in Orderchamp's own published
 * schema (confirmed via https://developers.orderchamp.com/getting-started's
 * type index) and every commerce GraphQL API's near-universal
 * `amount`/`currencyCode` convention. Category assignment (`CategoryPath`),
 * dimensions and images have no confirmed field/argument name at all and are
 * deliberately NOT sent by `untransformProduct`/`untransformVariant` — see
 * their doc comments for the metadata escape hatch instead of a guess.
 *
 * Verify every field name here against a live schema (GraphiQL /
 * introspection with a real token) before depending on this in production.
 */
import type { Product, ProductVariant } from '../../../schema/product'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawOrderchampMoney {
  amount: number | string
  currencyCode: string
}

export interface RawOrderchampVariant {
  id: string
  title?: string
  sku?: string
  price?: RawOrderchampMoney | null
  inventoryQuantity?: number | null
  inventoryPolicy?: string | null
  [key: string]: unknown
}

export interface RawOrderchampProduct {
  id: string
  title?: string
  variants?: { edges: Array<{ node: RawOrderchampVariant }> } | null
  [key: string]: unknown
}

function toMoney(raw: RawOrderchampMoney | null | undefined): { amount: number; currency: string } | undefined {
  if (!raw) return undefined
  const n = typeof raw.amount === 'string' ? Number(raw.amount) : raw.amount
  if (!Number.isFinite(n)) return undefined
  return { amount: majorToMinor(n, raw.currencyCode), currency: raw.currencyCode }
}

export function transformVariant(raw: RawOrderchampVariant, productId: string): ProductVariant {
  const price = toMoney(raw.price)
  if (!price) {
    throw new Error(`Orderchamp variant ${raw.id} has no usable price.`)
  }
  return {
    id: String(raw.id),
    productId,
    sku: raw.sku ?? undefined,
    title: raw.title ?? undefined,
    price,
    metadata: raw as Record<string, unknown>,
  }
}

/** Title is required canonically; a orderchamp product without one is not given an invented empty title. */
function requireTitle(title: string | null | undefined, id: string): string {
  if (!title) throw new Error(`orderchamp product ${id} has no title to map; refusing to invent one`)
  return title
}

export function transformProduct(raw: RawOrderchampProduct): Product {
  const edges = raw.variants?.edges ?? []
  return {
    id: String(raw.id),
    title: requireTitle(raw.title, String(raw.id)),
    variants: edges.length > 0 ? edges.map((e) => transformVariant(e.node, String(raw.id))) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * `ProductCreateInput`'s exact field names for category/dimensions/images
 * are not confirmed (see file header) — only the fields named below are.
 * A caller that needs the unconfirmed ones must supply the whole raw
 * mutation-input fragment via `metadata.raw`, which is merged in verbatim
 * (last, so it can also override a mapped field); this adapter never
 * fabricates a category/image argument name itself.
 */
export interface OrderchampProductInput {
  title?: string
  externalProductId?: string
  variants?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export function untransformProduct(data: Partial<Product>): OrderchampProductInput {
  const meta = data.metadata as Record<string, unknown> | undefined
  const out: OrderchampProductInput = {}
  if (data.title !== undefined) out.title = data.title
  if (meta?.['externalProductId']) out.externalProductId = String(meta['externalProductId'])
  if (data.variants && data.variants.length > 0) {
    out.variants = data.variants.map((v) => untransformVariantAttrs(v))
  }
  const rawOverride = meta?.['raw']
  if (rawOverride && typeof rawOverride === 'object') {
    return { ...out, ...(rawOverride as Record<string, unknown>) }
  }
  return out
}

function untransformVariantAttrs(v: Partial<ProductVariant>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (v.sku) out.sku = v.sku
  const meta = v.metadata as Record<string, unknown> | undefined
  if (meta?.['color']) out.color = meta['color']
  if (meta?.['size']) out.size = meta['size']
  if (meta?.['option']) out.option = meta['option']
  if (meta?.['externalProductVariantId']) out.externalProductVariantId = meta['externalProductVariantId']
  if (v.price) {
    const currency = v.price.currency
    out.price = { amount: minorToMajor(v.price.amount, currency), currencyCode: currency }
  }
  return out
}

export interface OrderchampVariantInput {
  productId?: string
  externalProductId?: string
  productVariantId?: string
  externalProductVariantId?: string
  [key: string]: unknown
}

/** `productVariantCreate` / `productVariantUpdate` input — see file header for the metadata escape hatch. */
export function untransformVariant(v: Partial<ProductVariant>): OrderchampVariantInput {
  const attrs = untransformVariantAttrs(v)
  if (v.id) attrs['productVariantId'] = v.id
  if (v.productId) attrs['productId'] = v.productId
  const meta = v.metadata as Record<string, unknown> | undefined
  const rawOverride = meta?.['raw']
  if (rawOverride && typeof rawOverride === 'object') {
    return { ...attrs, ...(rawOverride as Record<string, unknown>) }
  }
  return attrs
}
