import type { Product } from '../../../schema/plan'
import { strMap } from './shared'

/** A FastSpring localized string map (language code → text), e.g. { en: '…' }. */
type Localized = Record<string, string> | string | null | undefined

/** FastSpring product (catalog entry, identified by its product path). */
export interface RawFastspringProduct {
  product?: string
  display?: Localized
  description?: { summary?: Localized; full?: Localized } | null
  image?: string | null
  format?: string | null
  sku?: string | null
  pricing?: { price?: Record<string, number> } | null
  [k: string]: unknown
}

/**
 * FastSpring localizes display/description text by language. Prefer English,
 * then fall back to the first available locale, so the canonical record
 * always gets a usable scalar string.
 */
function pickLocalized(value: Localized): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value || undefined
  if (value.en) return value.en
  const first = Object.values(value).find((v) => typeof v === 'string' && v.length > 0)
  return first
}

export function transformProduct(raw: RawFastspringProduct): Product {
  const id = String(raw.product ?? '')
  const name = pickLocalized(raw.display) ?? id
  const summary = pickLocalized(raw.description?.summary)
  const full = pickLocalized(raw.description?.full)
  return {
    id,
    externalId: id,
    name,
    description: summary ?? full,
    gateway: 'fastspring',
    metadata: strMap({
      sku: raw.sku,
      format: raw.format,
      image: raw.image,
    }),
    raw,
  }
}
