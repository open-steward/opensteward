/**
 * Amazon SP-API Finances financial event → canonical Transaction.
 *
 * The Finances API returns a grab-bag of event types under
 * `FinancialEvents.{ShipmentEventList, RefundEventList, AdjustmentEventList,
 * SellerReviewEnrollmentPaymentEventList, …}`. Each represents money
 * movement on the seller's account and maps onto a canonical
 * `Transaction`.
 *
 * Transaction id format: `${amazonOrderId}:${eventType}:${postedDate}` —
 * Amazon does not expose a stable id for financial events, so we
 * synthesise a composite.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import type { RawAmazonMoney } from './order'
import type { RawAmazonChargeComponent } from './refund'

export type AmazonFinancialEventType =
  | 'ShipmentEvent'
  | 'RefundEvent'
  | 'AdjustmentEvent'
  | 'SellerReviewEnrollmentPaymentEvent'
  | 'GuaranteeClaimEvent'
  | 'ChargebackEvent'
  | 'ServiceFeeEvent'

export interface RawAmazonFinancialEvent {
  eventType: AmazonFinancialEventType
  AmazonOrderId?: string
  SellerOrderId?: string
  PostedDate?: string
  MarketplaceName?: string
  ShipmentItemList?: Array<{
    SellerSKU?: string
    OrderItemId?: string
    QuantityShipped?: number
    ItemChargeList?: RawAmazonChargeComponent[]
    ItemFeeList?: RawAmazonChargeComponent[]
  }>
  ShipmentItemAdjustmentList?: Array<{
    ItemChargeAdjustmentList?: RawAmazonChargeComponent[]
  }>
  AdjustmentAmount?: RawAmazonMoney
  AdjustmentType?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const KIND_BY_EVENT: Record<AmazonFinancialEventType, TransactionKind> = {
  ShipmentEvent: 'CAPTURE',
  RefundEvent: 'REFUND',
  AdjustmentEvent: 'CAPTURE',
  SellerReviewEnrollmentPaymentEvent: 'CAPTURE',
  GuaranteeClaimEvent: 'REFUND',
  ChargebackEvent: 'REFUND',
  ServiceFeeEvent: 'CAPTURE',
}

function toNum(m: RawAmazonMoney | undefined): number {
  if (!m) return 0
  const n = parseFloat(m.Amount)
  return Number.isNaN(n) ? 0 : n
}

function computeAmount(raw: RawAmazonFinancialEvent):
  | { amount: number; currency: string }
  | undefined {
  // Adjustment events expose a top-level AdjustmentAmount.
  if (raw.AdjustmentAmount) {
    return {
      amount: majorToMinor(Math.abs(toNum(raw.AdjustmentAmount)), raw.AdjustmentAmount.CurrencyCode),
      currency: raw.AdjustmentAmount.CurrencyCode,
    }
  }
  // Shipment events list charges + fees per item.
  if (raw.ShipmentItemList && raw.ShipmentItemList.length > 0) {
    let total = 0
    let currency = 'USD'
    for (const item of raw.ShipmentItemList) {
      for (const c of item.ItemChargeList ?? []) {
        total += toNum(c.ChargeAmount)
        if (c.ChargeAmount?.CurrencyCode) currency = c.ChargeAmount.CurrencyCode
      }
    }
    return { amount: majorToMinor(Math.abs(total), currency), currency }
  }
  // Refund events: sum the adjustment charges.
  if (raw.ShipmentItemAdjustmentList && raw.ShipmentItemAdjustmentList.length > 0) {
    let total = 0
    let currency = 'USD'
    for (const adj of raw.ShipmentItemAdjustmentList) {
      for (const c of adj.ItemChargeAdjustmentList ?? []) {
        total += toNum(c.ChargeAmount)
        if (c.ChargeAmount?.CurrencyCode) currency = c.ChargeAmount.CurrencyCode
      }
    }
    return { amount: majorToMinor(Math.abs(total), currency), currency }
  }
  return undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawAmazonFinancialEvent): Transaction {
  const kind = KIND_BY_EVENT[raw.eventType] ?? 'CAPTURE'
  // All finance events posted by Amazon are terminal — if the event is in
  // the Finances API payload, it has already settled.
  const status: TransactionStatus = 'SUCCESS'
  const amount = computeAmount(raw)
  const posted = raw.PostedDate ?? 'unknown'
  const orderId = raw.AmazonOrderId

  return {
    id: `${orderId ?? 'noorder'}:${raw.eventType}:${posted}`,
    orderId,
    kind,
    status,
    amount,
    gateway: 'amazon',
    processedAt: raw.PostedDate,
    createdAt: raw.PostedDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
