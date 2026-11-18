/**
 * KashFlow credit note → canonical CreditMemo transform.
 *
 * KashFlow has NO separate credit-note resource. A credit note is an invoice
 * with a negative total — the invoice-settings `CreditNoteName` field is just
 * the display label KashFlow uses "when you create an invoice for a negative
 * amount". So credit memos are read from the standard `/invoices` endpoint and
 * filtered to the negative ones.
 *
 * Docs: https://www.kashflow.com/developers/rest-api/api-invoices/
 *       https://www.kashflow.com/developers/rest-api/invoice-settings/
 */
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits } from '../../shared/transform'
import type { KashflowInvoice, KashflowInvoiceLineItem } from './invoice'

function toDate(val: unknown): Date | undefined {
  const iso = toIsoDatetime(val)
  return iso ? new Date(iso) : undefined
}

/** Absolute minor-unit amount — credit notes carry negative totals in KashFlow. */
function toAbsMinorUnits(val?: number): number | undefined {
  const minor = toMinorUnits(val)
  return minor !== undefined ? Math.abs(minor) : undefined
}

/**
 * A KashFlow invoice is a credit note when its total is negative.
 * Prefer GrossAmount; fall back to NetAmount when Gross is absent/zero.
 */
export function isCreditNote(raw: KashflowInvoice): boolean {
  if (typeof raw.GrossAmount === 'number' && raw.GrossAmount !== 0) return raw.GrossAmount < 0
  if (typeof raw.NetAmount === 'number') return raw.NetAmount < 0
  return false
}

function mapStatus(raw: KashflowInvoice): CreditMemoStatus {
  const s = (raw.Status ?? '').toLowerCase()
  if (s === 'paid' || s === 'overpaid') return 'PAID'
  if (s === 'overdue' || s === 'unpaid') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineItem(li: KashflowInvoiceLineItem): Lineitem {
  return {
    id: li.Number !== undefined ? String(li.Number) : undefined,
    accountId: li.NominalCode !== undefined ? String(li.NominalCode) : undefined,
    itemId: li.ProductCode || undefined,
    itemName: li.ProductName || undefined,
    itemDescription: li.Description || undefined,
    unitAmount: toAbsMinorUnits(li.Rate),
    unitQuantity: li.Quantity !== undefined ? Math.abs(li.Quantity) : undefined,
    taxAmount: toAbsMinorUnits(li.VATAmount),
    totalAmount:
      li.Rate !== undefined && li.Quantity !== undefined
        ? toAbsMinorUnits(li.Rate * li.Quantity + (li.VATAmount ?? 0))
        : undefined,
  }
}

export function transformCreditMemo(raw: KashflowInvoice): CreditMemo {
  // KashFlow stores credit notes as negative-total invoices; canonical
  // CreditMemo amounts are positive magnitudes.
  const totalAmount = toAbsMinorUnits(raw.GrossAmount)
  const taxAmount = toAbsMinorUnits(raw.VATAmount)
  const paidAmount = toAbsMinorUnits(raw.TotalPaidAmount)
  const balanceAmount =
    totalAmount !== undefined && paidAmount !== undefined
      ? totalAmount - paidAmount
      : undefined

  return {
    id: raw.Number !== undefined ? String(raw.Number) : raw.Id !== undefined ? String(raw.Id) : undefined,
    status: mapStatus(raw),
    creditmemoNumber: raw.Number !== undefined ? String(raw.Number) : undefined,
    contactId: raw.CustomerCode || undefined,
    currency: raw.Currency?.Code || undefined,
    totalAmount,
    taxAmount,
    paidAmount,
    balanceAmount,
    url: raw.Permalink || undefined,
    lineItems: (raw.LineItems ?? []).map(mapLineItem),
    postedAt: toDate(raw.IssuedDate),
    dueAt: toDate(raw.DueDate),
    paidAt: toDate(raw.PaidDate),
    metadata: raw as Record<string, unknown>,
  }
}
