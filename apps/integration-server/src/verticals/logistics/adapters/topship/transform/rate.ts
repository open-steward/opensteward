import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

// Topship /get-shipment-rate response item
export interface TopshipRate {
  mode?: string | null
  cost?: number | string | null
  duration?: string | null
  currency?: string | null
  pricingTier?: string | null
  [key: string]: unknown
}

function parseDurationDays(duration: string | null | undefined): number | undefined {
  if (!duration) return undefined
  // e.g. "3 - 5 Business Days", "1 Day", "7 days"
  const match = /(\d+)/.exec(duration)
  if (!match) return undefined
  return parseInt(match[1], 10)
}

export function transformRate(raw: TopshipRate): Rate {
  return {
    // Topship rates don't have individual IDs — use pricingTier as a stable identifier
    id: raw.pricingTier ?? undefined,
    // Topship uses pricingTier (Budget, Express, FedEx, Premium, LastMileBudget)
    // as the service level; no separate carrierId
    serviceCode: raw.mode ?? raw.pricingTier ?? undefined,
    serviceName: raw.pricingTier ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: parseDecimal(raw.cost),
    transitDays: parseDurationDays(raw.duration),
    deliveryDays: parseDurationDays(raw.duration),
    metadata: raw as Record<string, unknown>,
  }
}
