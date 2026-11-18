/**
 * KORONA Product → canonical Product.
 *
 * Shape verified against the live spec's `components.schemas.Product` at
 * https://128.koronacloud.com/web/api/v3/openapi.json (see also
 * https://manual.koronapos.com/korona-cloud-api-v3/).
 *
 * No price is mapped: `Product.prices[]` (`ProductPrice.value`) and every
 * other monetary field on this platform (`costs`, `maxPrice`, `minPrice`,
 * receipt/order totals, …) carry a bare number with NO currency field
 * anywhere in the schema. The only currency signal is a separate
 * `/currencies` resource with a `systemCurrency` flag (resolved once, in
 * `index.ts`, only for the one resource that truly needs it —
 * `transform/transaction.ts`). Inventing a currency for products would
 * violate the "never invent a default currency" rule, so `Product` here
 * carries no `variants` and no money at all — see `metadata.ts` for why
 * `variant` is not declared as its own resource.
 */

import type { Product, ProductStatus } from '../../../schema/product'

export interface KoronaModelReference {
  id: string
  number?: string
  name?: string
}

export interface KoronaProductCode {
  productCode?: string
}

export interface KoronaProductDescription {
  type?: string
  text?: string
}

export interface KoronaProduct {
  id: string
  revision?: number
  number?: string
  name?: string
  active?: boolean
  deactivated?: boolean
  listed?: boolean
  commodityGroup?: KoronaModelReference
  codes?: KoronaProductCode[]
  descriptions?: KoronaProductDescription[]
}

/** `deactivated`/`listed` are the only documented status-like flags — no
 *  status is guessed when neither is reported. */
function mapStatus(raw: KoronaProduct): ProductStatus | undefined {
  if (raw.deactivated === true) return 'ARCHIVED'
  if (raw.listed === true) return 'ACTIVE'
  return undefined
}

export function transformProduct(raw: KoronaProduct): Product {
  const description = raw.descriptions?.find((d) => d.type === 'DESCRIPTION')?.text
  return {
    id: raw.id,
    title: raw.name || raw.number || raw.id,
    description,
    status: mapStatus(raw),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → KORONA product body for `POST /products` (add,
 *  array-batched) / `PATCH /products/{id}` (edit, single object). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title) body['name'] = product.title
  if (product.description) {
    body['descriptions'] = [{ type: 'DESCRIPTION', text: product.description }]
  }
  if (product.status === 'ARCHIVED') body['deactivated'] = true
  if (product.status === 'ACTIVE') body['listed'] = true
  return body
}
