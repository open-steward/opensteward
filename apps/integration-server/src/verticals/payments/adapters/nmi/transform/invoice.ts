import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { decimalToMinor, parseNmiDatetime, pickCurrency, strMap, xmlTag } from './shared'

/**
 * A normalised NMI invoice record, decoded from a Query API
 * `report_type=invoicing` `<invoice>` block.
 *
 * Field names confirmed from the ZNMI TypeScript wrapper (ZachHandley/ZNMI)
 * `QueryInvoiceSchema`: invoice_id, amount, status, currency,
 * order_description, customer_id, created, billing fields (first_name,
 * last_name, email, address1, city, state, postal, country).
 *
 * NMI invoice statuses observed: open | paid | cancelled | closed | void.
 */
export interface RawNmiInvoice {
  invoiceId?: string
  /** Amount in major units ("12.50"). */
  amount?: string
  status?: string
  currency?: string
  orderDescription?: string
  /** NMI Customer Vault ID linked to this invoice. */
  customerId?: string
  orderId?: string
  poNumber?: string
  taxAmount?: string
  /** Compact NMI datetime YYYYMMDDHHmmss or date string. */
  created?: string
  firstName?: string
  lastName?: string
  email?: string
  raw?: unknown
}

function mapInvoiceStatus(raw: RawNmiInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'paid') return 'paid'
  if (s === 'open' || s === 'sent') return 'open'
  if (s === 'void' || s === 'closed' || s === 'cancelled' || s === 'canceled') return 'void'
  if (s === 'draft') return 'draft'
  return 'open'
}

export function transformInvoice(raw: RawNmiInvoice): Invoice {
  const total = decimalToMinor(raw.amount)
  const tax = decimalToMinor(raw.taxAmount)
  const subtotal = tax > 0 ? total - tax : undefined
  const status = mapInvoiceStatus(raw)
  return {
    id: String(raw.invoiceId ?? ''),
    externalId: String(raw.invoiceId ?? ''),
    number: raw.orderId || raw.poNumber || undefined,
    customerId: raw.customerId || undefined,
    status,
    currency: pickCurrency(raw.currency),
    subtotal: subtotal !== undefined && subtotal >= 0 ? subtotal : undefined,
    tax: tax > 0 ? tax : undefined,
    total,
    amountDue: status === 'paid' ? 0 : total,
    amountPaid: status === 'paid' ? total : undefined,
    amountRemaining: status === 'paid' ? 0 : total,
    gateway: 'nmi',
    metadata: strMap({
      order_description: raw.orderDescription,
      po_number: raw.poNumber,
    }),
    createdAt: parseNmiDatetime(raw.created),
    raw: raw.raw ?? raw,
  }
}

/** Decode one Query API `<invoice>` XML block into `RawNmiInvoice`. */
export function invoiceFromXml(block: string): RawNmiInvoice {
  return {
    invoiceId: xmlTag(block, 'invoice_id') ?? xmlTag(block, 'id'),
    amount: xmlTag(block, 'amount'),
    status: xmlTag(block, 'status'),
    currency: xmlTag(block, 'currency'),
    orderDescription: xmlTag(block, 'order_description'),
    customerId: xmlTag(block, 'customer_id') ?? xmlTag(block, 'customer_vault_id'),
    orderId: xmlTag(block, 'order_id') ?? xmlTag(block, 'orderid'),
    poNumber: xmlTag(block, 'po_number') ?? xmlTag(block, 'ponumber'),
    taxAmount: xmlTag(block, 'tax_amount') ?? xmlTag(block, 'tax'),
    created: xmlTag(block, 'created'),
    firstName: xmlTag(block, 'first_name'),
    lastName: xmlTag(block, 'last_name'),
    email: xmlTag(block, 'email'),
    raw: block,
  }
}
