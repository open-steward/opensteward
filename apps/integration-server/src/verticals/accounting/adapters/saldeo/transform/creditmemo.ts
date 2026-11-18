/**
 * SaldeoSMART document → canonical CreditMemo transform.
 *
 * SaldeoSMART does not have a dedicated credit-memo endpoint. Correction
 * invoices (faktury korygujące) are stored as regular documents with:
 *   IS_CORRECTIVE = true
 *   DOCUMENT_TYPE.TYPE ∈ { INVOICE_INCOME_CORRECTION, INVOICE_COST_CORRECTION,
 *                           INVOICE_COST_ADVANCE_CORRECTION }
 *
 * These are the closest equivalent to a canonical CreditMemo. The same
 * SaldeoDocument structure is reused from the invoice transform.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import { type SaldeoDocument } from './invoice'
import { toIsoDatetime } from '@opensteward/shared'

const CORRECTION_TYPES = new Set([
  'INVOICE_INCOME_CORRECTION',
  'INVOICE_COST_CORRECTION',
  'INVOICE_COST_ADVANCE_CORRECTION',
])

/** Returns true when the document is a correction invoice (credit memo). */
export function isCreditMemoType(docTypeType?: string): boolean {
  if (!docTypeType) return false
  return CORRECTION_TYPES.has(docTypeType.toUpperCase())
}

function mapStatus(doc: SaldeoDocument): CreditMemoStatus {
  if (
    doc.STAGE?.toLowerCase().includes('anulowan') ||
    doc.STAGE?.toLowerCase().includes('cancel')
  ) {
    return 'VOIDED'
  }
  if (doc.IS_DOCUMENT_PAID === 'true') return 'PAID'
  if (
    doc.STAGE?.toLowerCase().includes('zatwierdz') ||
    doc.STAGE?.toLowerCase().includes('approv')
  ) {
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

function safeFloat(val: string | undefined): number | undefined {
  if (typeof val !== 'string' || val === '') return undefined
  const n = parseFloat(val)
  return isNaN(n) ? undefined : n
}

function toDate(val: string | undefined): Date | undefined {
  const iso = toIsoDatetime(val)
  return iso ? new Date(iso) : undefined
}

export function transformCreditMemo(doc: SaldeoDocument): CreditMemo {
  const sum = safeFloat(doc.SUM)
  // Correction invoices may carry a negative SUM; convert to minor units.
  const totalAmount = sum !== undefined ? Math.round(sum * 100) : undefined
  const taxAmount = doc.VAT_REGISTRIES ? totalVat(doc.VAT_REGISTRIES) : undefined

  return {
    id: doc.DOCUMENT_ID || undefined,
    status: mapStatus(doc),
    creditmemoNumber: doc.NUMBER || undefined,
    contactId: doc.CONTRACTOR_ID ? String(doc.CONTRACTOR_ID) : undefined,
    currency: doc.CURRENCY_ISO4217 || undefined,
    totalAmount,
    taxAmount,
    postedAt: toDate(doc.ISSUE_DATE),
    dueAt: toDate(doc.PAYMENT_DATE),
    metadata: { _xml: doc._raw } as Record<string, unknown>,
  }
}
