import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

// ─── SF Express raw types ───────────────────────────────────────────────────

export interface SFDeliverTM {
  businessType?: string        // Service product code (e.g. "1" = Standard Express)
  businessTypeDesc?: string    // Human-readable service name
  deliverTime?: string         // Estimated delivery datetime "YYYY-MM-DD HH:mm:ss"
  fee?: number                 // Price in CNY
  searchPrice?: string         // "1" = price included, "0" = excluded
  closeTime?: string           // Cut-off time
  [key: string]: unknown
}

export interface SFDeliverTmResponse {
  deliverTmDto?: SFDeliverTM[]
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: SFDeliverTM): Rate {
  return {
    carrierId: 'sf-express',
    serviceCode: raw.businessType,
    serviceName: raw.businessTypeDesc,
    currency: 'CNY',
    totalAmount: raw.fee !== undefined ? Math.round(raw.fee * 100) : undefined,
    estimatedDeliveryAt: raw.deliverTime ? toISODate(raw.deliverTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformRates(raw: SFDeliverTmResponse): Rate[] {
  return (raw.deliverTmDto ?? []).map(transformRate)
}
