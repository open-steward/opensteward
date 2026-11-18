import { toCalendarDate } from '../../shared/transform'
/**
 * Billit Order → canonical Invoice / Bill transforms.
 *
 * Billit represents both sales invoices and purchase/cost invoices as "Orders"
 * on the same endpoint (`GET /v1/orders`). The canonical split is:
 *   OrderDirection = "Income" → Invoice (accounts receivable)
 *   OrderDirection = "Cost"   → Bill   (accounts payable)  [see bill.ts]
 *
 * Key Billit fields:
 *   OrderID        — platform's unique integer ID (stored as string)
 *   OrderNumber    — human-readable invoice number
 *   OrderType      — "Invoice", "CreditNote", "Offer", etc.
 *   OrderStatus    — "Draft", "ToSend", "ToPay", "Paid", "Canceled", …
 *   Paid           — boolean shorthand for full payment
 *   TotalExcl      — amount before VAT
 *   TotalVAT       — VAT portion
 *   TotalIncl      — grand total (excl + VAT)
 *   ToPay          — outstanding balance
 *   OrderDate      — issue date
 *   ExpiryDate     — due date
 *   CounterParty   — customer/supplier party object
 *   OrderLines     — line items
 *   Currency       — ISO-4217 code
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Billit wire types ─────────────────────────────────────────────────────────

export interface BillitAddress {
  AddressType?: string
  Street?: string
  StreetNumber?: string
  Box?: string
  Zipcode?: string
  City?: string
  CountryCode?: string
  Phone?: string
  Name?: string
  Tav?: string
  [key: string]: unknown
}

export interface BillitParty {
  PartyID?: string
  Nr?: string
  Name?: string
  CommercialName?: string
  VATNumber?: string
  PartyType?: string
  Addresses?: BillitAddress[]
  [key: string]: unknown
}

export interface BillitOrderLine {
  OrderLineID?: number
  ProductID?: number | null
  Description?: string
  Quantity?: number
  UnitPriceExcl?: number
  VATPercentage?: number
  TotalExcl?: number
  TotalVAT?: number
  TotalIncl?: number
  [key: string]: unknown
}

export interface BillitOrder {
  OrderID?: number
  OrderNumber?: string
  OrderType?: string       // "Invoice", "CreditNote", "Offer", "DeliveryNote", "OrderForm"
  OrderDirection?: string  // "Income" | "Cost"
  OrderStatus?: string     // "Draft", "ToSend", "ToPay", "Paid", "Canceled", …
  Paid?: boolean
  PaidDate?: string | null
  Currency?: string
  TotalExcl?: number
  TotalVAT?: number
  TotalIncl?: number
  ToPay?: number           // outstanding balance
  OrderDate?: string
  ExpiryDate?: string      // due date
  DeliveryDate?: string
  Created?: string
  LastModified?: string
  Reference?: string
  PaymentReference?: string
  Comments?: string
  CompanyID?: number
  CounterParty?: BillitParty
  Customer?: BillitParty
  Supplier?: BillitParty
  OrderLines?: BillitOrderLine[]
  IsSent?: boolean
  ExternalProvider?: string
  ExternalProviderID?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapOrderStatus(order: BillitOrder): InvoiceStatus {
  const status = (order.OrderStatus ?? '').toLowerCase()
  if (status === 'canceled') return 'VOIDED'
  if (status === 'credited') return 'VOIDED'
  if (status === 'paid' || order.Paid === true) return 'PAID'
  if (status === 'topay') {
    const toPay = order.ToPay ?? 0
    const total = order.TotalIncl ?? 0
    if (toPay > 0 && toPay < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  if (status === 'tosend' || status === 'sent' || status === 'invoiced') return 'AUTHORIZED'
  if (status === 'draft') return 'DRAFT'
  return 'DRAFT'
}

// ── Line items ────────────────────────────────────────────────────────────────

function mapOrderLine(line: BillitOrderLine): Lineitem {
  return {
    id: line.OrderLineID != null ? String(line.OrderLineID) : undefined,
    itemId: line.ProductID != null ? String(line.ProductID) : undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPriceExcl,
    unitQuantity: line.Quantity != null ? Math.round(line.Quantity) : undefined,
    taxAmount: line.TotalVAT,
    totalAmount: line.TotalIncl,
  }
}

// ── Canonical transform ───────────────────────────────────────────────────────

export function transformInvoice(raw: BillitOrder): Invoice {
  const party = raw.CounterParty ?? raw.Customer
  const totalIncl = raw.TotalIncl ?? 0
  const toPay = raw.ToPay ?? 0
  const paidAmount =
    raw.TotalIncl != null && (raw.Paid === true || toPay < totalIncl)
      ? totalIncl - toPay
      : undefined
  return {
    id: raw.OrderID != null ? String(raw.OrderID) : undefined,
    type: 'INVOICE',
    status: mapOrderStatus(raw),
    invoiceNumber: raw.OrderNumber || undefined,
    contactId: party?.PartyID || party?.Nr || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalIncl,
    taxAmount: raw.TotalVAT,
    paidAmount,
    balanceAmount: raw.ToPay,
    reference: raw.Reference || raw.PaymentReference || undefined,
    notes: raw.Comments || undefined,
    lineItems: (raw.OrderLines ?? []).map(mapOrderLine),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    dueAt: raw.ExpiryDate ? new Date(raw.ExpiryDate) : undefined,
    paidAt: raw.PaidDate ? new Date(raw.PaidDate) : undefined,
    createdAt: raw.Created ? new Date(raw.Created) : undefined,
    updatedAt: raw.LastModified ? new Date(raw.LastModified) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Reverse transform (canonical → Billit POST body) ─────────────────────────

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    OrderType: 'Invoice',
    OrderDirection: 'Income',
    OrderDate: toCalendarDate(invoice.postedAt),
    ExpiryDate: toCalendarDate(invoice.dueAt),
    Currency: invoice.currency,
    Reference: invoice.reference,
    CustomerID: invoice.contactId ? Number(invoice.contactId) : undefined,
    OrderLines: invoice.lineItems?.map((li) => ({
      Description: li.itemDescription,
      Quantity: li.unitQuantity,
      UnitPriceExcl: li.unitAmount,
      VATPercentage: 0,
      ProductID: li.itemId ? Number(li.itemId) : undefined,
    })),
  }
}
