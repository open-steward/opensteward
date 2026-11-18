import type { Rate } from '../../../schema/rate'

export interface GophrQuote {
  price_net?: number | null
  price_gross?: number | null
  currency?: string | null
  delivery_eta_minutes?: number | null
  [key: string]: unknown
}

export function transformRate(raw: GophrQuote): Rate {
  return {
    carrierId: 'gophr',
    serviceCode: 'gophr',
    serviceName: 'Gophr',
    currency: raw.currency ?? 'GBP',
    totalAmount: raw.price_gross ?? raw.price_net ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
