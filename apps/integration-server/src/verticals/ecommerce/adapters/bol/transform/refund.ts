/**
 * Bol.com Return → canonical Refund.
 *
 * Bol.com's Retailer API exposes returns (not "refunds" per se). When a
 * buyer returns an item, the retailer handles it via the Returns API.
 * We map Bol.com returns to canonical Refunds.
 *
 * Docs: https://api.bol.com/retailer/public/Retailers-Returns.html
 */

import type { Refund } from '../../../schema/refund'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawBolReturnItem {
  rmaId?: string
  orderId?: string
  orderItemId?: string
  ean?: string
  title?: string
  expectedQuantity?: number
  returnReason?: {
    mainReason?: string
    detailedReason?: string
    customerComments?: string
  }
  trackAndTrace?: string
  transporterName?: string
  handled?: boolean
  processingResults?: Array<{
    quantity?: number
    processingResult?: string
    handlingResult?: string
    processingDateTime?: string
  }>
  [key: string]: unknown
}

export interface RawBolReturn {
  returnId: string
  registrationDateTime?: string
  fulfilmentMethod?: string
  returnItems?: RawBolReturnItem[]
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawBolReturn): Refund {
  const firstItem = raw.returnItems?.[0]
  const orderId = firstItem?.orderId ?? 'unknown'
  const reason = firstItem?.returnReason?.mainReason
  const note = firstItem?.returnReason?.customerComments
  const processedAt =
    firstItem?.processingResults?.[0]?.processingDateTime ??
    raw.registrationDateTime

  return {
    id: String(raw.returnId),
    orderId,
    reason,
    note,
    processedAt,
    createdAt: raw.registrationDateTime,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a refund list from Bol.com returns array.
 */
export function transformRefunds(
  items: RawBolReturn[] | undefined,
): Refund[] {
  if (!items || items.length === 0) return []
  return items.map(transformRefund)
}
