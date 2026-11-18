import type { Rate } from '../../../schema/rate'

/**
 * Represents a Curri DeliveryQuote from the deliveryQuote / deliveryQuotes queries.
 * Ref: https://docs.curri.com/docs/queries-and-mutations/get-a-quote
 */
export interface CurriQuote {
  id?: string | null
  /** Quoted delivery fee in USD cents */
  fee?: number | null
  deliveryMethod?: string | null
  /** Estimated duration in minutes */
  duration?: number | null
  distance?: number | null
  priority?: string | null
  [key: string]: unknown
}

export function transformRate(raw: CurriQuote): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: 'curri',
    serviceCode: raw.deliveryMethod ?? 'curri',
    serviceName: raw.deliveryMethod ? `Curri ${raw.deliveryMethod}` : 'Curri',
    currency: 'USD',
    // Curri fee is in USD cents
    totalAmount: raw.fee != null ? raw.fee / 100 : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
