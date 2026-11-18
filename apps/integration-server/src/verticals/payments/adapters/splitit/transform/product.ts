import type { Product } from '../../../schema/plan'
import { toIso, strMap } from './shared'

export interface RawStripeProduct {
  id: string
  object: 'product'
  name: string
  description?: string | null
  active?: boolean
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

export function transformProduct(raw: RawStripeProduct): Product {
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    active: raw.active,
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}
