/**
 * VosFactures → canonical CreditMemo transform.
 *
 * VosFactures represents credit notes as regular billing documents with
 * `kind = "correction"` ("correction" - facture d'avoir, README "Valeurs des
 * Champs"). They carry a `correction_reason` field and reference the original
 * invoice via `invoice_id` (see `mapAppliedTo`). The adapter serves only
 * revenue-side corrections (`income` "1"): an expense-side correction credits
 * a supplier document, which this adapter serves as a Bill.
 * `isRevenueCorrection` is the test.
 *
 * Amounts are major-unit decimals in the document's `currency`, reported in
 * minor units of that currency (../money.ts names the fields and the README
 * passages they come from). The README's partial credit note example sends
 * the correction line negative (`"quantity": -1`, `"total_price_gross": "-10"`),
 * so header amounts are reported as magnitudes, the canonical CreditMemo
 * convention, whichever sign VosFactures returns. Line amounts are normalised
 * by the note's own sign instead (see `documentSign`), so a line of the
 * opposite sign stays opposite and the lines still sum to the header.
 *
 * Docs: https://github.com/vosfactures/API
 */
import type {
  CreditMemo,
  CreditMemoApplication,
  CreditMemoStatus,
} from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { documentAmounts, parseVosFacturesDecimal } from '../money'
import { mapPosition, type VosFacturesInvoice, type VosFacturesPosition } from './invoice'

// ── Helpers ───────────────────────────────────────────────────────────────

function mapStatus(raw: VosFacturesInvoice): CreditMemoStatus {
  switch (raw.status) {
    case 'paid':
      return 'PAID'
    case 'partial':
      return 'PARTIALLY_PAID'
    case 'rejected':
      return 'VOIDED'
    case 'sent':
    case 'accepted':
      return 'AUTHORIZED'
    case 'issued':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

/** `income`: "revenu (1) ou dépense (0)"; the README's examples also send "true". */
function isRevenue(income: unknown): boolean {
  return income === 1 || income === '1' || income === true || income === 'true'
}

/**
 * Is this document a customer credit note: `kind` "correction" ("facture
 * d'avoir") on the revenue side (`income` "1")? `listCreditMemos` asks the
 * API for exactly these (`kind=correction&income=1`); `getCreditMemo` reads
 * the shared `/invoices/{id}.json` endpoint and uses this to refuse anything
 * else.
 */
export function isRevenueCorrection(raw: VosFacturesInvoice | null | undefined): boolean {
  return raw != null && raw.kind === 'correction' && isRevenue(raw.income)
}

function magnitude(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.abs(value)
}

/**
 * The sign that turns this note's amounts into a credit read as positive: -1
 * when VosFactures stored it negative, else 1. Taken from the header
 * `price_gross`, or, when that is absent or zero, from the sum of the lines'
 * `total_price_gross`.
 */
function documentSign(raw: VosFacturesInvoice, positions: VosFacturesPosition[]): number {
  const header = parseVosFacturesDecimal(raw.price_gross)
  const total =
    header !== undefined && header !== 0
      ? header
      : positions.reduce((sum, p) => sum + (parseVosFacturesDecimal(p?.total_price_gross) ?? 0), 0)
  return total < 0 ? -1 : 1
}

function signed(value: number | undefined, sign: number): number | undefined {
  return value === undefined ? undefined : value * sign || 0
}

/**
 * A position with its amounts normalised by the note's sign. Which of
 * `quantity` or the price carries the negative sign varies (the README's
 * example negates both), so the quantity is reported unsigned and the unit
 * price takes the sign of the normalised line total.
 */
function mapCreditLine(
  pos: VosFacturesPosition,
  currency: string | undefined,
  sign: number,
): Lineitem {
  const line = mapPosition(pos, currency)
  const totalAmount = signed(line.totalAmount ?? undefined, sign)
  const unitSign = totalAmount !== undefined && totalAmount < 0 ? -1 : 1
  const unit = magnitude(line.unitAmount ?? undefined)
  return {
    ...line,
    unitAmount: unit === undefined ? undefined : unit * unitSign || 0,
    unitQuantity: magnitude(line.unitQuantity ?? undefined),
    taxAmount: signed(line.taxAmount ?? undefined, sign),
    totalAmount,
  }
}

/**
 * The invoice this credit note corrects.
 *
 * The VosFactures API README (https://github.com/vosfactures/API, "Liste des
 * champs principaux" and "Créer une facture d'avoir") documents two fields:
 *
 *   - `invoice_id`: "ID du document de référence ayant un lien fonctionnel
 *     avec le document". For a credit note, the README says to put the
 *     reference invoice's ID here, and that this is what creates the
 *     functional link between the invoice and the credit note.
 *   - `from_invoice_id`: "ID du document à partir duquel le document a été
 *     généré". The README says it creates no functional link, and "Créer un
 *     doc. similaire" fills it too, so on a credit note it can name another
 *     credit note. It is not read here.
 *
 * `invoice_id` is a document id from the same `/invoices` endpoint the
 * Invoice transform reads, so it is the Invoice resource's `id`. That holds
 * only for revenue documents (`income` "1"): an expense-side correction
 * (`income` "0") references an expense document, which this adapter serves
 * as a Bill, not an Invoice. With `income` absent the side is unknown, so
 * nothing is emitted rather than a link into the wrong resource.
 *
 * The API gives no applied amount or date for the link, so only
 * `invoiceId` is set.
 */
function mapAppliedTo(raw: VosFacturesInvoice): CreditMemoApplication[] | undefined {
  if (!isRevenue(raw.income)) return undefined
  const ref = raw.invoice_id
  if (ref === undefined || ref === null) return undefined
  const invoiceId = String(ref).trim()
  if (invoiceId === '' || invoiceId === '0') return undefined
  return [{ invoiceId }]
}

// ── Public transform ──────────────────────────────────────────────────────

export function transformCreditMemo(raw: VosFacturesInvoice): CreditMemo {
  const currency = raw.currency || undefined
  const amounts = documentAmounts(raw, currency)
  const totalAmount = magnitude(amounts.totalAmount)
  const paidAmount = magnitude(amounts.paidAmount)
  const positions = Array.isArray(raw.positions) ? raw.positions : undefined
  const sign = documentSign(raw, positions ?? [])

  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.client_id !== undefined ? String(raw.client_id) : undefined,
    currency,
    totalAmount,
    taxAmount: magnitude(amounts.taxAmount),
    paidAmount,
    // Magnitudes first: the stored sign of `paid` on a credit note is not
    // documented, so a signed difference could double the balance.
    balanceAmount:
      totalAmount !== undefined && paidAmount !== undefined ? totalAmount - paidAmount : undefined,
    notes: (raw.correction_reason as string | undefined) || raw.description || undefined,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.payment_to ? new Date(raw.payment_to) : undefined,
    lineItems: positions ? positions.map((pos) => mapCreditLine(pos, currency, sign)) : undefined,
    appliedTo: mapAppliedTo(raw),
    metadata: raw as Record<string, unknown>,
  }
}
