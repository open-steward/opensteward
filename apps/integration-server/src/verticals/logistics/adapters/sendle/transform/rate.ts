import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Sendle raw types ────────────────────────────────────────────────────────

export interface SendleProduct {
  product: {
    code: string
    name: string
    first_mile_option: string
    service: string
  }
  quote: {
    gross: { amount: number; currency: string }
    net: { amount: number; currency: string }
    tax: { amount: number; currency: string }
  }
  eta: {
    days_range: [number, number]
    date_range: [string, string]
  }
  route: {
    description: string
    type: string
  }
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformRate(raw: SendleProduct): Rate {
  const [minDays, maxDays] = raw.eta?.days_range ?? [undefined, undefined]
  const [, maxDate] = raw.eta?.date_range ?? [undefined, undefined]

  return {
    id: raw.product?.code ?? undefined,
    carrierId: 'sendle',
    serviceCode: raw.product?.code ?? undefined,
    serviceName: raw.product?.name ?? undefined,
    currency: raw.quote?.gross?.currency ?? undefined,
    totalAmount: parseDecimal(raw.quote?.gross?.amount),
    transitDays: maxDays ?? minDays ?? undefined,
    deliveryDays: maxDays ?? minDays ?? undefined,
    estimatedDeliveryAt: toISODate(maxDate),
    metadata: raw as Record<string, unknown>,
  }
}
