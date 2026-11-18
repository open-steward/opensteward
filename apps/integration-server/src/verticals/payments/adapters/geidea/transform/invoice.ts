/**
 * Geidea eInvoice (Payment Intent) — `/payment-intent/api/v1/direct/eInvoice`
 *
 * Geidea exposes "Pay by Link" invoices under the `payment-intent` service.
 * An eInvoice is a hosted payment page sent to a customer; it carries line
 * items (`eInvoiceDetails.eInvoiceItems`), amounts, customer info, and a
 * lifecycle `status` (Created → SentToCustomer → Paid / Expired / Cancelled).
 *
 * List endpoint: GET  /payment-intent/api/v1/direct/eInvoice
 *   — paginates with Skip / Take, same convention as orders.
 * Get endpoint:  GET  /payment-intent/api/v1/direct/eInvoice/{paymentIntentId}
 *
 * Amounts arrive as major-unit decimals (same convention as orders).
 *
 * Docs: https://docs.geidea.net/docs/pay-by-link-apis
 *       https://docs.geidea.net/reference/find-list-of-payment-links
 */
import type { Invoice, InvoiceStatus, InvoiceLineItem } from '../../../schema/invoice'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, toMinorUnits, strMap, pickStr } from './shared'

export interface RawGeideaEInvoiceItem {
  description?: string
  price?: number
  quantity?: number
  total?: number
  sku?: string
  [k: string]: unknown
}

export interface RawGeideaEInvoiceDetails {
  subtotal?: number
  grandTotal?: number
  eInvoiceItems?: RawGeideaEInvoiceItem[]
  invoiceDiscount?: number
  extraCharges?: number
  merchantReferenceId?: string
  [k: string]: unknown
}

export interface RawGeideaCustomer {
  name?: string
  email?: string
  phoneCountryCode?: string
  phoneNumber?: string
  [k: string]: unknown
}

export interface RawGeideaEInvoice {
  paymentIntentId?: string
  number?: string
  status?: string
  amount?: number
  currency?: string
  customerId?: string
  customer?: RawGeideaCustomer
  eInvoiceDetails?: RawGeideaEInvoiceDetails
  link?: string
  expiryDate?: string
  activationDate?: string
  createdDate?: string
  updatedDate?: string
  subscriptionId?: string
  merchantReferenceId?: string
  [k: string]: unknown
}

function mapInvoiceStatus(raw: string | null | undefined): InvoiceStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'paid':
    case 'completed':
      return 'paid'
    case 'created':
    case 'senttoсustomer':
    case 'senttocustomer':
    case 'initiated':
      return 'open'
    case 'cancelled':
    case 'canceled':
    case 'deleted':
      return 'void'
    case 'expired':
    case 'uncollectible':
      return 'uncollectible'
    case 'draft':
      return 'draft'
    default:
      return 'open'
  }
}

function transformLineItems(
  invoiceId: string,
  currency: string,
  details: RawGeideaEInvoiceDetails | undefined,
): InvoiceLineItem[] {
  if (!details?.eInvoiceItems?.length) return []
  return details.eInvoiceItems.map((item, i) => ({
    id: `${invoiceId}-item-${i}`,
    externalId: `${invoiceId}-item-${i}`,
    invoiceId,
    description: pickStr(item.description),
    quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
    unitAmount: toMinorUnits(item.price, currency),
    amount: toMinorUnits(item.total ?? item.price, currency) ?? 0,
    currency,
    metadata: strMap({ sku: item.sku }),
  }))
}

export function transformInvoice(raw: RawGeideaEInvoice): Invoice {
  const currency = pickCurrency(raw.currency)
  const id = String(raw.paymentIntentId ?? '')
  const details = raw.eInvoiceDetails
  const total = toMinorUnits(raw.amount ?? details?.grandTotal, currency) ?? 0
  const subtotal = toMinorUnits(details?.subtotal, currency)
  const status = mapInvoiceStatus(raw.status)
  const lineItems = transformLineItems(id, currency, details)
  return {
    id,
    externalId: id,
    number: pickStr(raw.number),
    customerId: pickStr(raw.customerId),
    subscriptionId: pickStr(raw.subscriptionId),
    status,
    currency,
    subtotal,
    total,
    amountDue: status === 'paid' ? 0 : total,
    amountPaid: status === 'paid' ? total : 0,
    amountRemaining: status === 'paid' ? 0 : total,
    dueDate: toIsoDatetime(raw.expiryDate),
    paidAt: status === 'paid' ? toIsoDatetime(raw.updatedDate) : undefined,
    hostedInvoiceUrl: pickStr(raw.link),
    lineItemIds: lineItems.length ? lineItems.map((li) => li.id) : undefined,
    gateway: 'geidea',
    metadata: strMap({
      merchantReferenceId: raw.merchantReferenceId ?? details?.merchantReferenceId,
      number: raw.number,
    }),
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    raw,
  }
}
