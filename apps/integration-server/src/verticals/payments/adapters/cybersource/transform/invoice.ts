/**
 * Cybersource Invoice transform.
 *
 * Cybersource Invoicing API exposes invoices at:
 *   GET  /invoicing/v2/invoices               — list (envelope: { invoices: [], totalInvoices: n })
 *   GET  /invoicing/v2/invoices/{id}          — get by ID
 *
 * Status values: CANCELED, CREATED, DRAFT, PAID, PARTIAL, PENDING, SENT
 *
 * Docs: https://developer.cybersource.com/docs/cybs/en-us/invoicing/developer/all/rest/invoicing
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawCybersourceInvoice {
  id?: string
  status?: string
  submitTimeUtc?: string
  customerInformation?: {
    name?: string
    email?: string
  }
  invoiceInformation?: {
    invoiceNumber?: string
    description?: string
    dueDate?: string
    paymentLink?: string
    deliveryMode?: string
    allowPartialPayments?: boolean
  }
  orderInformation?: {
    amountDetails?: {
      totalAmount?: string | number
      currency?: string
      balanceAmount?: string | number
    }
    lineItems?: Array<{
      productSku?: string
      productName?: string
      unitPrice?: string | number
      quantity?: number | string
      totalAmount?: string | number
    }>
  }
  processingInformation?: {
    requestPhone?: boolean
    requestShipping?: boolean
  }
  [k: string]: unknown
}

function mapStatus(s: string | undefined): InvoiceStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'PAID':
      return 'paid'
    case 'DRAFT':
      return 'draft'
    case 'SENT':
    case 'PENDING':
    case 'PARTIAL':
    case 'CREATED':
      return 'open'
    case 'CANCELED':
    case 'CANCELLED':
      return 'void'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawCybersourceInvoice): Invoice {
  const amtDetails = raw.orderInformation?.amountDetails
  const invInfo = raw.invoiceInformation

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: invInfo?.invoiceNumber ?? undefined,
    customerId: raw.customerInformation?.email ?? undefined,
    status: mapStatus(raw.status),
    currency: pickCurrency(amtDetails?.currency),
    total: decimalToMinor(amtDetails?.totalAmount),
    amountDue: decimalToMinor(amtDetails?.balanceAmount),
    amountPaid: decimalToMinor(amtDetails?.totalAmount) - decimalToMinor(amtDetails?.balanceAmount),
    amountRemaining: decimalToMinor(amtDetails?.balanceAmount),
    dueDate: invInfo?.dueDate ?? undefined,
    hostedInvoiceUrl: invInfo?.paymentLink ?? undefined,
    gateway: 'cybersource',
    metadata: strMap({
      deliveryMode: invInfo?.deliveryMode,
      description: invInfo?.description,
      customerName: raw.customerInformation?.name,
      customerEmail: raw.customerInformation?.email,
    }),
    createdAt: raw.submitTimeUtc ?? undefined,
    raw,
  }
}
