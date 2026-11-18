/**
 * Spendesk supplier-invoice payable → canonical Invoice
 *
 * Spendesk is accounts payable, so every invoice here is a supplier bill
 * (`type: 'BILL'`). listInvoices reads search payables filtered to
 * `payableType = invoicePurchase`; getInvoice reads GET /v1/payables/{id} and
 * accepts only `type === 'invoicePurchase'`.
 *
 * Status is not mapped. The only state either shape carries is bookkeeping
 * (`bookkeepingStatus`: created, prepared, exported, …; search `state`:
 * toPrepare, toExport, exported) — whether the payable has been exported to
 * accounting, not whether it has been paid.
 *
 * Field mapping (search / get):
 *   invoiceNumber ← documentaryEvidence.invoiceNumber (type 'invoice') / invoiceNumber
 *   contactId     ← counterparty.supplierId|memberId / counterparty.id
 *   totalAmount   ← amount
 *   balanceAmount ← outstandingAmount
 *   postedAt      ← creationDate / payableDate
 *   dueAt         ← dueDate / invoiceDueDate
 *   createdAt     ← firstCreatedAt / createdAt
 */

import type { Invoice } from '../../../schema/invoice'
import {
  mapPayableLines,
  mapSearchLines,
  searchContactId,
  toDate,
  type SpendeskPayable,
  type SpendeskSearchPayable,
} from './expense'

/** GET /v1/payables/{id} → Invoice */
export function transformPayableAsInvoice(raw: SpendeskPayable): Invoice {
  return {
    id: raw.id || undefined,
    type: 'BILL',
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.counterparty?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: typeof raw.amount === 'number' ? raw.amount : undefined,
    balanceAmount: typeof raw.outstandingAmount === 'number' ? raw.outstandingAmount : undefined,
    lineItems: mapPayableLines(raw.lineItems),
    postedAt: toDate(raw.payableDate),
    dueAt: toDate(raw.invoiceDueDate),
    createdAt: toDate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}

/** POST /v1/payables/search (payableType invoicePurchase) → Invoice */
export function transformSearchPayableAsInvoice(raw: SpendeskSearchPayable): Invoice {
  const evidence = raw.documentaryEvidence
  return {
    id: raw.id || undefined,
    type: 'BILL',
    invoiceNumber: (evidence?.type === 'invoice' && evidence.invoiceNumber) || undefined,
    contactId: searchContactId(raw),
    currency: raw.currency || undefined,
    totalAmount: typeof raw.amount === 'number' ? raw.amount : undefined,
    balanceAmount: typeof raw.outstandingAmount === 'number' ? raw.outstandingAmount : undefined,
    lineItems: mapSearchLines(raw.itemLines),
    postedAt: toDate(raw.creationDate),
    dueAt: toDate(raw.dueDate),
    createdAt: toDate(raw.firstCreatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
