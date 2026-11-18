/**
 * Webgility Connect Invoices API → PurchaseOrder transform.
 *
 * Webgility does not have a dedicated purchase-order endpoint; we map the
 * Invoices resource (vendor bills / AP invoices) to the PurchaseOrder schema.
 *
 * Endpoint: GET /v1/invoices, GET /v1/invoices/{InvoiceId}
 * Ref: https://github.com/webgility/connect-v1.0/wiki/Invoices-API
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawWebgilityInvoice {
  InvoiceId: string
  InvoiceNumber?: string
  InvoiceDate?: string
  DueDate?: string
  Status?: string
  /** Amount already paid */
  AmountPaid?: number
  /** Amount still owed */
  AmountDue?: number
  AmountCredited?: number
  SubTotal?: number
  TotalTax?: number
  Total?: number
  Currency?: string
  Customer?: {
    CustomerId?: string
    Name?: string
    EmailAddress?: string
  }
  InvoiceLines?: Array<{
    Id?: string
    Description?: string
    UnitPrice?: number
    Quantity?: number
    ItemId?: string
    AccountCode?: string
    TaxAmount?: number
    LineAmount?: number
  }>
  Payments?: Array<{ PaymentId?: string; PaymentDate?: string; PaymentAmount?: number }>
  ResponseAt?: string
  CreatedAt?: string
  UpdatedAt?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  const upper = (s ?? '').toUpperCase()
  switch (upper) {
    case 'DRAFT': return 'draft'
    case 'SUBMITTED': case 'AUTHORISED': case 'SENT': return 'sent'
    case 'PARTIALLY PAID': return 'partially_received'
    case 'PAID': return 'received'
    case 'VOIDED': case 'DELETED': case 'CANCELLED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawWebgilityInvoice): PurchaseOrder {
  const latestPayment = (raw.Payments ?? []).slice(-1)[0]

  return {
    id: raw.InvoiceId,
    externalId: raw.InvoiceId,
    number: pickStr(raw.InvoiceNumber),
    supplierId: raw.Customer?.CustomerId ?? '',
    destinationLocationId: undefined,
    status: mapStatus(raw.Status),
    currency: pickStr(raw.Currency),
    subtotalAmount: raw.SubTotal,
    totalAmount: raw.Total,
    lines: (raw.InvoiceLines ?? []).map((l) => ({
      productId: l.ItemId ?? l.Id ?? '',
      quantityOrdered: l.Quantity ?? 0,
      quantityReceived: undefined,
      unitCost: l.UnitPrice,
      lineTotal: l.LineAmount,
    })),
    expectedAt: toIso(raw.DueDate),
    orderedAt: toIso(raw.InvoiceDate),
    receivedAt: latestPayment ? toIso(latestPayment.PaymentDate) : undefined,
    platform: 'webgility',
    metadata: strMap({
      amountDue: raw.AmountDue,
      amountPaid: raw.AmountPaid,
      totalTax: raw.TotalTax,
    }),
    raw,
  }
}
