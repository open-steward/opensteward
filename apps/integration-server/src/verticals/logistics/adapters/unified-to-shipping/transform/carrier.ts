import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

/** Unified.to ShippingCarrier response shape. */
export interface UnifiedShippingCarrier {
  id?: string | null
  name?: string | null
  code?: string | null
  logoUrl?: string | null
  websiteUrl?: string | null
  isActive?: boolean | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  raw?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformCarrier(raw: UnifiedShippingCarrier): Carrier {
  return {
    id: raw.id ?? undefined,
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    isActive: raw.isActive ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
