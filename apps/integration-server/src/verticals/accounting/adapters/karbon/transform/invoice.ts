import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Karbon raw types ──────────────────────────────────────────────────────────

export interface KarbonInvoiceClient {
  ClientKey?: string
  ClientType?: string
  Name?: string
  AddressLine?: string
  City?: string
  StateProvinceCounty?: string
  ZipCode?: string
  Country?: string
  EmailAddress?: string
}

export interface KarbonTaxLineItem {
  TaxName?: string
  TaxValue?: number
}

export interface KarbonInvoiceLineItem {
  LineItemKey?: string
  BillableItemEntityKey?: string
  BillableItemType?: string
  Description?: string
  Quantity?: number
  UnitPrice?: string | number
  Amount?: number
  TaxRate?: number
  TaxRateName?: string
}

export interface KarbonPayment {
  PaymentKey?: string
  PaymentReference?: string
  PaymentType?: string
  PaymentDate?: string
  Amount?: number
}

export interface KarbonInvoice {
  InvoiceKey: string
  InvoiceNumber?: string
  TotalAmountDue?: number
  InvoiceTotal?: number
  InvoiceSubTotal?: number
  InvoiceTaxTotal?: number
  InvoiceDate?: string
  PaymentDueDate?: string
  UpdatedAt?: string
  CreatedAt?: string
  CurrencyCode?: string
  PaymentInstructions?: string | null
  InvoiceStatus?: string
  Client?: KarbonInvoiceClient
  TaxLineItems?: KarbonTaxLineItem[]
  LineItems?: KarbonInvoiceLineItem[]
  Payments?: KarbonPayment[]
  [key: string]: unknown
}

// ── Status map ────────────────────────────────────────────────────────────────

function mapStatus(status?: string): InvoiceStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'approved': return 'AUTHORIZED'
    case 'awaitingpayment': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'exported': return 'PAID'
    case 'voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

// ── Line item transform ───────────────────────────────────────────────────────

function mapLineitem(li: KarbonInvoiceLineItem): Lineitem {
  const unitAmount = li.UnitPrice != null ? Number(li.UnitPrice) : undefined
  return {
    id: li.LineItemKey || undefined,
    itemDescription: li.Description || undefined,
    unitAmount: isNaN(unitAmount as number) ? undefined : unitAmount,
    unitQuantity: li.Quantity != null ? Math.round(li.Quantity) : undefined,
    totalAmount: li.Amount,
    taxAmount: li.TaxRate != null && li.Amount != null
      ? Math.round(li.Amount * li.TaxRate / (100 + li.TaxRate))
      : undefined,
  }
}

// ── Main transform ────────────────────────────────────────────────────────────

export function transformInvoice(raw: KarbonInvoice): Invoice {
  const paidAmount = (raw.Payments ?? []).reduce((sum, p) => sum + (p.Amount ?? 0), 0)
  const total = raw.InvoiceTotal ?? 0
  const balance = raw.TotalAmountDue ?? (total - paidAmount)

  return {
    id: raw.InvoiceKey,
    type: 'INVOICE',
    status: mapStatus(raw.InvoiceStatus),
    invoiceNumber: raw.InvoiceNumber || undefined,
    contactId: raw.Client?.ClientKey || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: total || undefined,
    taxAmount: raw.InvoiceTaxTotal || undefined,
    balanceAmount: balance || undefined,
    paidAmount: paidAmount || undefined,
    notes: raw.PaymentInstructions || undefined,
    lineItems: (raw.LineItems ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.PaymentDueDate ? new Date(raw.PaymentDueDate) : undefined,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.UpdatedAt ? new Date(raw.UpdatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
