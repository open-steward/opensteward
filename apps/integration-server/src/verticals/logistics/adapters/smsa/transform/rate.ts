import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

// ─── SMSA raw types ────────────────────────────────────────────────────────

export interface SmsaRate {
  service_code: string | null
  service_name: string | null
  currency: string | null
  amount: number | null
  transit_days: number | null
  [key: string]: unknown
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformRate(raw: SmsaRate): Rate {
  return {
    id: raw.service_code ?? undefined,
    carrierId: 'smsa',
    serviceCode: raw.service_code ?? undefined,
    serviceName: raw.service_name ?? undefined,
    currency: raw.currency ?? 'SAR',
    totalAmount: parseDecimal(raw.amount),
    transitDays: raw.transit_days ?? undefined,
    deliveryDays: raw.transit_days ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
