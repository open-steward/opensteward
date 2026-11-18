import type { Rate } from '../../../schema/rate'

export interface StuartPricing {
  amount?: number | null
  currency?: string | null
  tax_amount?: number | null
  [key: string]: unknown
}

export function transformRate(raw: StuartPricing): Rate {
  return {
    carrierId: 'stuart',
    serviceCode: 'stuart',
    serviceName: 'Stuart',
    currency: raw.currency ?? undefined,
    totalAmount: raw.amount ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
