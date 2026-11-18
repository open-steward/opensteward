/**
 * Bold Price Rules ruleset → canonical Discount.
 *
 * Shape from https://developer.boldcommerce.com/api/price-rules.openapi.yaml
 * (`Ruleset`: "A set of rules that can apply to a defined group of products,
 * depending on the rule conditions being met."). The rules themselves are a
 * nested condition/action model with no single type or value, so they stay in
 * `metadata` rather than being squeezed into `type` / `value`.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Discount } from '../../../schema/discount'

export interface RawBoldRuleset {
  id: number
  public_name?: string
  internal_name?: string
  active?: boolean
  rules?: unknown[]
  product_selection?: Record<string, unknown>
  created_at?: string
  updated_at?: string | null
  start_date?: string | null
  expiry_date?: string | null
  external_id?: string
  app_slug?: string
  [key: string]: unknown
}

export function transformRuleset(raw: RawBoldRuleset): Discount {
  const out: Discount = {
    id: String(raw.id),
    metadata: { ...raw },
  }
  // `public_name`: "A public facing name for the ruleset."
  if (raw.public_name) out.title = raw.public_name
  // `start_date`: "Date from which the ruleset should be considered effective."
  const startsAt = toIsoDatetime(raw.start_date)
  if (startsAt) out.startsAt = startsAt
  // `expiry_date`: "Date from which the ruleset will stop being effective."
  const endsAt = toIsoDatetime(raw.expiry_date)
  if (endsAt) out.endsAt = endsAt
  const createdAt = toIsoDatetime(raw.created_at)
  if (createdAt) out.createdAt = createdAt
  return out
}
