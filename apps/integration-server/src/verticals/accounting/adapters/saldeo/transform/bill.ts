/**
 * SaldeoSMART document → canonical Bill transform.
 *
 * SaldeoSMART stores cost invoices (bills/supplier invoices) as documents
 * with DOCUMENT_TYPE.TYPE values such as:
 *   INVOICE_COST, INVOICE_COST_ADVANCE, INVOICE_COST_CORRECTION
 *
 * Same underlying XML structure as Invoice — only the document type
 * classification differs.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import { type SaldeoDocument } from './invoice'
import { toIsoDatetime } from '@opensteward/shared'

function mapStatus(doc: SaldeoDocument): BillStatus {
  if (doc.STAGE?.toLowerCase().includes('anulowan') || doc.STAGE?.toLowerCase().includes('cancel')) {
    return 'VOIDED'
  }
  if (doc.IS_DOCUMENT_PAID === 'true') return 'PAID'
  if (doc.STAGE?.toLowerCase().includes('zatwierdz') || doc.STAGE?.toLowerCase().includes('approv')) {
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function totalVat(registries: SaldeoDocument['VAT_REGISTRIES']): number | undefined {
  if (!registries?.length) return undefined
  let sum = 0
  for (const r of registries) {
    const v = parseFloat(r.VAT ?? '0')
    if (!isNaN(v)) sum += v
  }
  return Math.round(sum * 100)
}

/** Safe float parse that returns undefined instead of NaN. */
function safeFloat(val: string | undefined): number | undefined {
  if (typeof val !== 'string' || val === '') return undefined
  const n = parseFloat(val)
  return isNaN(n) ? undefined : n
}

/** Convert a raw date/datetime string to a Date via toIsoDatetime for safe handling. */
function toDate(val: string | undefined): Date | undefined {
  const iso = toIsoDatetime(val)
  return iso ? new Date(iso) : undefined
}

export function transformBill(doc: SaldeoDocument): Bill {
  const sum = safeFloat(doc.SUM)
  const totalAmount = sum !== undefined ? Math.round(sum * 100) : undefined
  const vatAmount = doc.VAT_REGISTRIES ? totalVat(doc.VAT_REGISTRIES) : undefined

  return {
    id: doc.DOCUMENT_ID || undefined,
    status: mapStatus(doc),
    billNumber: doc.NUMBER || undefined,
    contactId: doc.CONTRACTOR_ID ? String(doc.CONTRACTOR_ID) : undefined,
    currency: doc.CURRENCY_ISO4217 || undefined,
    totalAmount,
    taxAmount: vatAmount,
    postedAt: toDate(doc.ISSUE_DATE),
    dueAt: toDate(doc.PAYMENT_DATE),
    metadata: { _xml: doc._raw } as Record<string, unknown>,
  }
}
