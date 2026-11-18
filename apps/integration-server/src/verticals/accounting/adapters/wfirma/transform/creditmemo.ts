/**
 * wFirma correction invoices → canonical CreditMemo.
 *
 * wFirma does not have a separate credit-memo endpoint. Credit notes are
 * represented as invoices with `type = "correction"` (Polish: "faktura korygująca").
 * They share the same /invoices find/get endpoints filtered by type.
 *
 * Derived from: /invoices/find (with type=correction filter) and /invoices/get/{id}
 *
 * Reference: wFirma forum https://forum.wfirma.pl/temat/2557-faktura-korygujaca-w-apiv2
 * and existing invoice transform (./invoice.ts) which already notes type=correction.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import { toMinorUnits } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'
import type { WfirmaInvoice } from './invoice'

/** Convert a raw upstream timestamp to a Date via toIsoDatetime for safe handling. */
function toDate(v: unknown): Date | undefined {
  const iso = toIsoDatetime(v)
  return iso ? new Date(iso) : undefined
}

function mapStatus(inv: WfirmaInvoice): CreditMemoStatus {
  const state = (inv.paymentstate ?? '').toLowerCase()
  if (state === 'paid') return 'PAID'
  if (state === 'unpaid') return 'AUTHORIZED'
  return 'DRAFT'
}

/**
 * Transform a wFirma correction invoice into a canonical CreditMemo.
 * The caller MUST supply only invoices where raw.type === "correction".
 */
export function transformCreditMemo(raw: WfirmaInvoice): CreditMemo {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    status: mapStatus(raw),
    creditmemoNumber: raw.fullnumber || (raw.number !== undefined ? String(raw.number) : undefined),
    contactId: raw.contractor_id !== undefined ? String(raw.contractor_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.brutto),
    taxAmount: toMinorUnits(raw.tax),
    paidAmount: toMinorUnits(raw.paid),
    balanceAmount: toMinorUnits(raw.remaining),
    notes: raw.notes || raw.description || undefined,
    postedAt: toDate(raw.date),
    dueAt: toDate(raw.paymentdate),
    createdAt: toDate(raw.created),
    updatedAt: toDate(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}
