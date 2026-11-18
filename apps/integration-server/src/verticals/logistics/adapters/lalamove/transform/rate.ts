import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Lalamove raw types ────────────────────────────────────────────────────

export interface LalamoveQuotation {
  quotationId: string | null
  service_type: string | null
  total_fee: number | null
  currency: string | null
  estimated_duration: number | null
  created_at: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: LalamoveQuotation): Rate {
  return {
    id: raw.quotationId ?? undefined,
    carrierId: 'lalamove',
    serviceCode: raw.service_type ?? undefined,
    currency: raw.currency ?? 'USD',
    totalAmount: parseDecimal(raw.total_fee),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
