/**
 * Dodo Payments `Product` → canonical `Product`.
 *
 * Dodo products carry pricing inline (`price`, `currency`, `is_recurring`)
 * plus a `tax_category`. The canonical `Product` is catalog-only, so price
 * details land in `metadata`; `Price`/`Plan` aren't separately listable on
 * Dodo and are therefore left unimplemented (auto-501).
 *
 * Docs: https://docs.dodopayments.com/api-reference/products/get-products
 */
import type { Product } from '../../../schema/plan'
import { toIsoDatetime } from '@opensteward/shared'
import { strMap } from './shared'

export interface RawDodoProduct {
  product_id?: string
  business_id?: string
  name?: string | null
  description?: string | null
  price?: number | null
  currency?: string | null
  tax_category?: string | null
  tax_inclusive?: boolean
  is_recurring?: boolean
  image?: string | null
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

export function transformProduct(raw: RawDodoProduct): Product {
  return {
    id: String(raw.product_id ?? ''),
    externalId: String(raw.product_id ?? ''),
    name: raw.name ?? '',
    description: raw.description ?? undefined,
    active: true,
    gateway: 'dodo-payments',
    metadata: strMap({
      ...raw.metadata,
      price: raw.price,
      currency: raw.currency,
      tax_category: raw.tax_category,
      tax_inclusive: raw.tax_inclusive,
      is_recurring: raw.is_recurring,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.created_at),
    raw,
  }
}
