/**
 * QuickFile credit note → canonical CreditMemo.
 *
 * QuickFile has no credit-note resource and no credit-note `InvoiceType`.
 * Invoice_Search documents `InvoiceType` as exactly INVOICE, ESTIMATE or
 * RECURRING (https://api.quickfile.co.uk/d/v1_2/Invoice_Search, fetched
 * 2026-09-29). A credit note is an INVOICE whose value is negative:
 * Invoice_Create documents a `CreditNote` block as "Credit Note Meta data for
 * negative invoices" (https://api.quickfile.co.uk/d/v1_2/Invoice_Create), and
 * the usage guide that page links to says "In QuickFile Credit Notes are
 * essentially negative value invoices ... You'll need to ensure your total
 * invoice value is negative"
 * (https://community.quickfile.co.uk/t/creating-a-credit-note-using-the-api/23204).
 * The community answer to "list my credit notes" is an invoice search over
 * a negative amount range (https://community.quickfile.co.uk/t/5264).
 *
 * Shapes, from the vendor's JSON samples (POST /GetJsonSample/<method>/1_2,
 * the "JSON" tab of each method page):
 *   - `QuickFileInvoiceSearchRecord` — one `Body.Record[]` row of
 *     Invoice_Search: IssueDate, InvoiceID, ClientID, ClientCompanyName,
 *     ClientContactName, InvoiceNumber, Description, Currency, Amount,
 *     NetAmount, VatAmount, Status, ViewHref. No line items.
 *   - `QuickFileInvoiceDetails` — `Body.InvoiceDetails` of Invoice_Get:
 *     InvoiceID, CreatedDate, InvoiceType, InvoiceNumber, IssueDate, ClientID,
 *     Currency, TotalAmount, Discount, Notes, Status, and `ItemLines.Item[]` /
 *     `TaskLines.Task[]` (ItemLineID, ItemName, ItemDescription, NominalCode,
 *     TaxName1, TaxPercentage1, UnitCost, Qty, LineTotal).
 *
 * Amounts are decimals in the document's `Currency` ("Currency ISO code"), so
 * they go through `toMinorUnits` with it. The header amounts of a credit note
 * are negative; they are reported as magnitudes, the canonical CreditMemo
 * convention. Line totals are multiplied by the note's own sign instead, so a
 * line of the opposite sign stays opposite and the lines still sum to it.
 *
 * `LineTotal` is net of tax: in the Invoice_Get sample the lines total
 * 100 + 20 + 200 = 320 at 20% VAT and `TotalAmount` is 384. So
 * `lineAmountsIncludeTax` is false wherever lines are present.
 *
 * `appliedTo` is left out. The parent invoice is only an INPUT
 * (`CreditNote.ParentInvoiceId` on Invoice_Create); neither the Invoice_Get
 * nor the Invoice_Search response documents it, and it is optional even on
 * create ("REFUND type credit notes can exist independently").
 */
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { toCalendarDate, toMinorUnits, prefixedId } from '../../shared/transform'

/** A row of Invoice_Search `Body.Record[]`. */
export interface QuickFileInvoiceSearchRecord {
  InvoiceID: number
  IssueDate?: string | null
  ClientID?: number | null
  ClientCompanyName?: string | null
  ClientContactName?: string | null
  InvoiceNumber?: string | null
  Description?: string | null
  Currency?: string | null
  /** Gross amount (the sample's 0.35 net + 0.07 VAT = 0.42). */
  Amount?: number | string | null
  /** Returned when `AdditionalParameters.ShowNetAmount` is true. */
  NetAmount?: number | string | null
  /** Returned when `AdditionalParameters.ShowVatAmount` is true. */
  VatAmount?: number | string | null
  Status?: string | null
  ViewHref?: string | null
  [key: string]: unknown
}

/** One `ItemLines.Item[]` or `TaskLines.Task[]` entry of Invoice_Get. */
export interface QuickFileInvoiceLine {
  ItemLineID?: number | null
  ItemID?: number | null
  ItemName?: string | null
  ItemDescription?: string | null
  NominalCode?: string | null
  TaxName1?: string | null
  TaxPercentage1?: number | null
  UnitCost?: number | string | null
  Qty?: number | string | null
  LineTotal?: number | string | null
  [key: string]: unknown
}

/** Invoice_Get `Body.InvoiceDetails`. */
export interface QuickFileInvoiceDetails {
  InvoiceID: number
  CreatedDate?: string | null
  InvoiceType?: string | null
  InvoiceNumber?: string | null
  IssueDate?: string | null
  ClientID?: number | null
  Currency?: string | null
  TotalAmount?: number | string | null
  Discount?: number | string | null
  Notes?: string | null
  Status?: string | null
  ItemLines?: { Item?: OneOrMany<QuickFileInvoiceLine> | null } | null
  TaskLines?: { Task?: OneOrMany<QuickFileInvoiceLine> | null } | null
  [key: string]: unknown
}

/**
 * QuickFile's JSON API is a proxy over its XML API, so a one-element array
 * arrives as a bare object: `"Record": { … }` rather than `"Record": [{ … }]`.
 * QuickFile confirmed this and said it will not change
 * (https://community.quickfile.co.uk/t/16824, where it shows for
 * Client_Search). The same conversion applies to every repeated element, so
 * both `Body.Record` and the `Item` / `Task` line lists go through here.
 */
export type OneOrMany<T> = T | T[]

export function asArray<T>(val: OneOrMany<T> | null | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

function decimal(val: number | string | null | undefined): number | undefined {
  if (val === undefined || val === null || val === '') return undefined
  const n = typeof val === 'number' ? val : Number(val)
  return Number.isFinite(n) ? n : undefined
}

/** The document's gross value: `Amount` on a search row, `TotalAmount` on a detail. */
function grossOf(raw: QuickFileInvoiceSearchRecord | QuickFileInvoiceDetails): number | undefined {
  return 'TotalAmount' in raw && raw.TotalAmount !== undefined
    ? decimal(raw.TotalAmount as QuickFileInvoiceDetails['TotalAmount'])
    : decimal((raw as QuickFileInvoiceSearchRecord).Amount)
}

/**
 * Is this invoice a credit note? Credit notes are negative-value invoices
 * (see the header). An estimate or recurring profile is never one.
 */
export function isCreditNote(
  raw: QuickFileInvoiceSearchRecord | QuickFileInvoiceDetails | null | undefined,
): boolean {
  if (raw == null) return false
  const type = (raw as QuickFileInvoiceDetails).InvoiceType
  if (type != null && type !== 'INVOICE') return false
  const gross = grossOf(raw)
  return gross !== undefined && gross < 0
}

function magnitude(
  val: number | string | null | undefined,
  currency: string | undefined,
): number | undefined {
  const minor = toMinorUnits(val, currency)
  return minor === undefined ? undefined : Math.abs(minor)
}

/**
 * Invoice_Search's documented `Status` values are DRAFT, SENT, DISPUTED,
 * PAIDPART, PAIDFULL, ACTIVE, UNPAID, DELETED, AGED, PAUSED, AGREED and
 * DECLINED. ACTIVE and PAUSED belong to recurring profiles and AGREED and
 * DECLINED to estimates, so on a credit note they are reported as unknown.
 */
function mapStatus(status: string | null | undefined): CreditMemoStatus | undefined {
  if (status === undefined || status === null || status === '') return undefined
  switch (status.toUpperCase()) {
    case 'DRAFT':
      return 'DRAFT'
    case 'SENT':
    case 'UNPAID':
    case 'AGED':
    case 'DISPUTED':
      return 'AUTHORIZED'
    case 'PAIDPART':
      return 'PARTIALLY_PAID'
    case 'PAIDFULL':
      return 'PAID'
    case 'DELETED':
      return 'DELETED'
    default:
      return 'unknown'
  }
}

function mapLine(line: QuickFileInvoiceLine, currency: string | undefined, sign: number): Lineitem {
  const minorTotal = toMinorUnits(line.LineTotal, currency)
  const total = minorTotal === undefined ? undefined : minorTotal * sign || 0
  // Which of Qty or UnitCost carries a credit note's negative sign is not
  // documented, so the quantity is reported unsigned and the unit price takes
  // the sign of the normalised line total. A fractional quantity (Qty is a
  // 4-decimal value in the sample) is left out rather than rounded.
  const unitSign = total !== undefined && total < 0 ? -1 : 1
  const unit = magnitude(line.UnitCost, currency)
  const qty = decimal(line.Qty)
  const quantity = qty === undefined ? undefined : Math.abs(qty)
  return {
    id: line.ItemLineID != null ? String(line.ItemLineID) : undefined,
    itemId: line.ItemID != null && line.ItemID !== 0 ? String(line.ItemID) : undefined,
    itemName: line.ItemName || undefined,
    itemDescription: line.ItemDescription || undefined,
    accountId: line.NominalCode || undefined,
    unitAmount: unit === undefined ? undefined : unit * unitSign || 0,
    unitQuantity: quantity !== undefined && Number.isInteger(quantity) ? quantity : undefined,
    totalAmount: total,
  }
}

export function transformCreditMemo(
  raw: QuickFileInvoiceSearchRecord | QuickFileInvoiceDetails,
): CreditMemo {
  const currency = raw.Currency || undefined
  const gross = grossOf(raw)
  const sign = gross !== undefined && gross < 0 ? -1 : 1
  const detail = raw as QuickFileInvoiceDetails
  const lines = [...asArray(detail.ItemLines?.Item), ...asArray(detail.TaskLines?.Task)]
  const hasLines = detail.ItemLines != null || detail.TaskLines != null
  const search = raw as QuickFileInvoiceSearchRecord
  return {
    id: String(raw.InvoiceID),
    status: mapStatus(raw.Status),
    creditmemoNumber: raw.InvoiceNumber || undefined,
    contactId: prefixedId('cust', raw.ClientID),
    currency,
    totalAmount: magnitude(gross, currency),
    taxAmount: magnitude(search.VatAmount, currency),
    notes: detail.Notes || undefined,
    lineAmountsIncludeTax: hasLines && lines.length > 0 ? false : undefined,
    lineItems: hasLines ? lines.map((l) => mapLine(l, currency, sign)) : null,
    postedAt: toCalendarDate(raw.IssueDate),
    metadata: raw as Record<string, unknown>,
  }
}
