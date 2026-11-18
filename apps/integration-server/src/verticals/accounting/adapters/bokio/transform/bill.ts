/**
 * Bokio `supplierInvoiceGet` ↔ canonical Bill.
 *
 * Shape: the `supplierInvoiceGet` schema ("SupplierInvoice") of the Preview
 * supplier-invoices API. GET /companies/{companyId}/supplier-invoices/{id}
 * (https://docs.bokio.se/reference/get-supplier-invoice-by-id.md) answers it
 * bare, and GET /companies/{companyId}/supplier-invoices
 * (https://docs.bokio.se/reference/get-supplier-invoices.md) answers it as the
 * `items` of the paged envelope; the two pages declare the schema
 * identically. The rows were renamed to `lineItems` on 2026-09-07
 * (https://docs.bokio.se/changelog/2026-09-07.md). Only fields that schema
 * declares are read; the whole row is kept as `metadata`, which is where
 * `supplierRef.name`, `currencyRate` and `journalEntryRef` stay.
 *
 * `contactId` is `supplierRef.id`, a supplier id. The adapter's contacts list
 * serves Bokio suppliers (GET suppliers,
 * https://docs.bokio.se/reference/get-suppliers.md) after its customers, and
 * getContact falls back to GET suppliers/{id}, so it resolves there.
 *
 * `uploadRefs` ("Unique identifier of an existing upload") become
 * `attachments`: the upload id, and as `url` the documented download path
 * GET /companies/{companyId}/uploads/{uploadId}/download
 * (https://docs.bokio.se/reference/download-upload.md, scope `uploads:read`),
 * which answers only with the connection's bearer token. No per-upload
 * request is made, so the upload's `description` and `contentType`
 * (get-upload.md) are not filled in as fileName and mimeType: GET uploads
 * filters by description and journalEntryId only, not by id, so they would
 * cost one request per upload.
 *
 * Amounts are decimal major units of `currency` (`number`/`double`, the same
 * convention as the invoice schema — see transform/invoice.ts) and are
 * converted to minor units with the currency.
 *
 * VAT (observed on live data, 2026-09-29). The schema carries no tax total
 * and does not say whether `lineItems[].unitPrice` includes VAT, and the
 * documented examples cannot settle it (10 × 100 at 25 % beside
 * `totalAmount: 1000` reads as VAT-inclusive, or as VAT-free). A real Bokio
 * sync on 2026-09-29 did: three supplier invoices of two lines each gave
 * (SEK)
 *
 *   A: 1 × 400 + 2 × 800  = 2000 net, totalAmount 2500
 *   B: 1 × 800 + 3 × 800  = 3200 net, totalAmount 4000
 *   C: 4 × 800 + 1 × 1200 = 4400 net, totalAmount 5500
 *
 * so in every case `totalAmount` = net × 1.25: `unitPrice` EXCLUDES VAT and
 * `totalAmount` INCLUDES it. The live API sends the rows as `lineItems` (not
 * the older `rows`). Hence, when the supplier invoice has lines:
 *
 *  - `lineAmountsIncludeTax` is false;
 *  - a line's `taxAmount` is quantity × unitPrice × taxRate / 100 in minor
 *    units, rounded as `toMinorUnits` rounds (`Math.round` of the decimal
 *    amount, as the other adapters that derive per-line tax from a rate do,
 *    e.g. ifirma). A line without a numeric `taxRate` gets none;
 *  - a line's `totalAmount` is its net, quantity × unitPrice. Under
 *    `lineAmountsIncludeTax: false` the Bill schema reads line
 *    `unitAmount`/`totalAmount` as tax-exclusive, as Xero's `LineAmount`
 *    (under `Exclusive`) and ifirma's line total are; net + tax there would
 *    count the VAT twice for a reader who adds the header `taxAmount`;
 *  - the header `taxAmount` is `totalAmount` − Σ line net, in minor units,
 *    only when every line has a net amount (numeric quantity and unitPrice).
 *
 * With no lines, `lineAmountsIncludeTax` and `taxAmount` stay unset. `taxRate`
 * is a bare percentage per line with no tax-rate id, so no `taxrateId`.
 *
 * A negative `totalAmount` is a supplier credit (live: `totalAmount` −200 with
 * `remainingAmount` 0). It stays a bill with its negative total, its status is
 * derived on the absolute amounts (see mapBillStatus), and `metadata` carries
 * `supplierCredit: true`.
 *
 * Not mapped, because the schema does not carry them: a status and any
 * timestamp (no created/updated/paid dates).
 */
import { fromMinorUnits, toCalendarDate, toMinorUnits } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Attachment, Lineitem } from '../../../schema/shared'
import { BOKIO_API_BASE } from '../constants'

/** `supplierInvoiceLineItem`. */
export interface BokioSupplierInvoiceLineItem {
  /** uuid, server-generated. */
  id?: string
  description?: string
  /** double, "default": 1. */
  quantity?: number
  unitPrice?: number
  unitType?: string
  /** Percent, e.g. 25; nullable. */
  taxRate?: number | null
  projectRef?: { id?: string | null; projectName?: string; projectNumber?: string } | null
  costCenterRef?: { tagId?: string | null; tagName?: string } | null
  [key: string]: unknown
}

export interface BokioSupplierInvoice {
  id: string
  /** `id` (uuid) is required, `name` read-only. */
  supplierRef?: { id?: string; name?: string }
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  totalAmount?: number
  /** Read-only: what is still owed on the supplier invoice. */
  remainingAmount?: number
  currency?: string
  currencyRate?: number
  journalEntryRef?: { id?: string } | null
  lineItems?: BokioSupplierInvoiceLineItem[]
  uploadRefs?: Array<{ id?: string }>
  [key: string]: unknown
}

/**
 * Bokio documents no status on a supplier invoice, so the status is derived
 * from the two amounts it does document, and from nothing else:
 *
 *  - `remainingAmount` 0                                  → PAID
 *  - 0 < |remaining| < |total|, both of the same sign     → PARTIALLY_PAID
 *  - |remaining| = |total| (nothing settled yet)          → AUTHORIZED, Bill's open status
 *  - any other pair (signs differ, |remaining| > |total|) → AUTHORIZED
 *  - either amount missing                                → unset
 *
 * Comparing absolute values makes a supplier credit (negative `totalAmount`,
 * negative `remainingAmount` while unapplied) read the way a bill does: a
 * credit of −200 with −100 remaining is PARTIALLY_PAID. For a positive total
 * every answer is the one the signed comparison gave.
 *
 * OVERDUE is never derived. It would need `dueDate` compared with the clock
 * inside the transform; the repo has no injected-clock convention, and a
 * cached row would keep the answer of whichever day it was synced on. A
 * caller has `dueAt` and `balanceAmount` to decide it at read time. DRAFT is
 * not derived either: nothing in the schema says whether a supplier invoice
 * is booked (`journalEntryRef` is nullable but undefined in meaning).
 */
export function mapBillStatus(raw: BokioSupplierInvoice): BillStatus | undefined {
  const total = raw.totalAmount
  const remaining = raw.remainingAmount
  if (typeof total !== 'number' || typeof remaining !== 'number') return undefined
  if (remaining === 0) return 'PAID'
  const sameSign = Math.sign(remaining) === Math.sign(total)
  if (sameSign && Math.abs(remaining) < Math.abs(total)) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

/** `quantity` is a double (hours, kilograms); the canonical one is an integer. */
function integerOrUndefined(n: number | undefined): number | undefined {
  return typeof n === 'number' && Number.isInteger(n) ? n : undefined
}

/**
 * quantity × unitPrice in minor units: the line's net, VAT excluded (see the
 * file header). Unset unless both are numbers.
 */
function lineNet(item: BokioSupplierInvoiceLineItem, currency?: string): number | undefined {
  const { quantity, unitPrice } = item
  if (typeof quantity !== 'number' || typeof unitPrice !== 'number') return undefined
  return toMinorUnits(quantity * unitPrice, currency)
}

/** `taxRate` is a percentage (25 = 25 %), not a money scale. */
const PERCENT = 100

/** quantity × unitPrice × taxRate % in minor units; unset without a numeric taxRate. */
function lineTax(item: BokioSupplierInvoiceLineItem, currency?: string): number | undefined {
  const { quantity, unitPrice, taxRate } = item
  if (typeof quantity !== 'number' || typeof unitPrice !== 'number') return undefined
  if (typeof taxRate !== 'number') return undefined
  return toMinorUnits((quantity * unitPrice * taxRate) / PERCENT, currency)
}

function mapLineItem(item: BokioSupplierInvoiceLineItem, currency?: string): Lineitem {
  return {
    id: item.id || undefined,
    itemDescription: item.description || undefined,
    unitAmount: toMinorUnits(item.unitPrice, currency),
    unitQuantity: integerOrUndefined(item.quantity),
    taxAmount: lineTax(item, currency),
    // Tax-exclusive, as lineAmountsIncludeTax: false declares (file header).
    totalAmount: lineNet(item, currency),
  }
}

/**
 * The header VAT: `totalAmount` (VAT included) − Σ line net (VAT excluded),
 * in minor units. Unset without lines, without a total, or when any line
 * lacks a net amount.
 */
function headerTax(raw: BokioSupplierInvoice, currency?: string): number | undefined {
  const total = toMinorUnits(raw.totalAmount, currency)
  const lines = raw.lineItems
  if (total === undefined || !lines?.length) return undefined
  let net = 0
  for (const li of lines) {
    const n = lineNet(li, currency)
    if (n === undefined) return undefined
    net += n
  }
  return total - net
}

/**
 * `uploadRefs` → attachments. The `url` needs the company id, the path
 * segment every Bokio request carries; without one only the id is kept.
 */
function mapAttachments(
  refs: BokioSupplierInvoice['uploadRefs'],
  companyId?: string,
): Attachment[] | undefined {
  const out: Attachment[] = []
  for (const ref of refs ?? []) {
    if (!ref?.id) continue
    out.push({
      id: ref.id,
      url: companyId
        ? `${BOKIO_API_BASE}companies/${encodeURIComponent(companyId)}/uploads/${encodeURIComponent(ref.id)}/download`
        : undefined,
    })
  }
  return out.length ? out : undefined
}

export function transformBill(raw: BokioSupplierInvoice, companyId?: string): Bill {
  const currency = raw.currency || undefined
  const supplierCredit = typeof raw.totalAmount === 'number' && raw.totalAmount < 0
  return {
    id: raw.id,
    status: mapBillStatus(raw),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.supplierRef?.id || undefined,
    currency,
    totalAmount: toMinorUnits(raw.totalAmount, currency),
    taxAmount: headerTax(raw, currency),
    balanceAmount: toMinorUnits(raw.remainingAmount, currency),
    // Tax-exclusive lines, observed on live data (see the file header).
    lineAmountsIncludeTax: raw.lineItems?.length ? false : undefined,
    lineItems: raw.lineItems ? raw.lineItems.map((li) => mapLineItem(li, currency)) : undefined,
    attachments: mapAttachments(raw.uploadRefs, companyId),
    postedAt: toCalendarDate(raw.invoiceDate),
    dueAt: toCalendarDate(raw.dueDate),
    metadata: supplierCredit
      ? { ...(raw as Record<string, unknown>), supplierCredit: true }
      : (raw as Record<string, unknown>),
  }
}

function validationError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' })
}

/** The body of POST supplier-invoices (`supplierInvoiceCreate`) and PUT (`supplierInvoiceUpdate`). */
export interface BokioSupplierInvoiceWrite {
  supplierRef: { id: string }
  invoiceNumber?: string
  invoiceDate: string
  dueDate: string
  totalAmount: number
  uploadRef?: { id: string }
  lineItems?: BokioSupplierInvoiceLineItem[]
}

/**
 * Canonical Bill → the body of POST supplier-invoices
 * (https://docs.bokio.se/reference/post-supplier-invoice.md) or, laid over the
 * current supplier invoice, of PUT supplier-invoices/{id}
 * (https://docs.bokio.se/reference/put-supplier-invoice.md).
 *
 * Both require `supplierRef.id` (contactId), `invoiceDate` (postedAt),
 * `dueDate` (dueAt) and `totalAmount`; `invoiceNumber` is billNumber. A line
 * requires `description` (itemDescription) and `unitPrice` (unitAmount);
 * `quantity` is unitQuantity. Amounts go out in major units of `currency`,
 * which the caller resolves from Bokio (the supplier's currency on create,
 * the supplier invoice's on update): a supplier invoice takes no currency of
 * its own.
 *
 * On update, "Existing line items not included in the array are removed", so
 * when the canonical bill names no lines the current ones are sent back
 * unchanged; a canonical line whose `id` matches a current line is laid over
 * it, keeping the fields the canonical line has no counterpart for (taxRate,
 * unitType, projectRef, costCenterRef). A new line carries no taxRate, which
 * the schema allows (nullable, not required).
 *
 * POST takes one `uploadRef`; PUT takes none. So one attachment id becomes
 * the uploadRef on create, and more than one, or any on update, is refused.
 */
export function untransformBill(
  data: Partial<Bill>,
  currency: string,
  current?: BokioSupplierInvoice,
): BokioSupplierInvoiceWrite {
  const supplierId = data.contactId ?? current?.supplierRef?.id
  const invoiceDate = toCalendarDate(data.postedAt) ?? current?.invoiceDate
  const dueDate = toCalendarDate(data.dueAt) ?? current?.dueDate
  const totalAmount =
    data.totalAmount != null ? fromMinorUnits(data.totalAmount, currency) : current?.totalAmount
  const missing = [
    !supplierId && 'contactId (supplierRef.id)',
    !invoiceDate && 'postedAt (invoiceDate)',
    !dueDate && 'dueAt (dueDate)',
    totalAmount === undefined && 'totalAmount',
  ].filter(Boolean)
  if (missing.length) {
    throw validationError(
      `A Bokio supplier invoice requires ${missing.join(', ')} ` +
        '(https://docs.bokio.se/reference/post-supplier-invoice.md).',
    )
  }

  let uploadRef: { id: string } | undefined
  if (data.attachments !== undefined) {
    if (current) {
      throw validationError(
        'PUT supplier-invoices/{id} takes no uploadRef (https://docs.bokio.se/reference/put-supplier-invoice.md); omit attachments.',
      )
    }
    const ids = data.attachments.map((a) => a.id).filter((id): id is string => !!id)
    if (ids.length !== data.attachments.length || ids.length > 1) {
      throw validationError(
        'POST supplier-invoices takes one uploadRef, the id of an existing upload; send at most one attachment, with its id.',
      )
    }
    if (ids[0]) uploadRef = { id: ids[0] }
  }

  let lineItems: BokioSupplierInvoiceLineItem[] | undefined
  if (data.lineItems != null) {
    const existing = new Map((current?.lineItems ?? []).map((li) => [li.id, li]))
    lineItems = data.lineItems.map((li, i) => {
      if (!li.itemDescription || li.unitAmount == null) {
        throw validationError(
          `Bokio supplier invoice line ${i + 1}: itemDescription and unitAmount are required ` +
            '(description and unitPrice, https://docs.bokio.se/reference/post-supplier-invoice.md).',
        )
      }
      const base = li.id ? existing.get(li.id) : undefined
      if (li.id && !base) {
        throw validationError(
          `Bokio supplier invoice line ${i + 1}: id ${li.id} is not a line of this supplier invoice; omit the id to add a line.`,
        )
      }
      return {
        ...base,
        description: li.itemDescription,
        unitPrice: fromMinorUnits(li.unitAmount, currency),
        ...(li.unitQuantity != null && { quantity: li.unitQuantity }),
      }
    })
  } else if (current?.lineItems) {
    lineItems = current.lineItems
  }

  return {
    supplierRef: { id: supplierId! },
    ...((data.billNumber ?? current?.invoiceNumber) !== undefined && {
      invoiceNumber: data.billNumber ?? current?.invoiceNumber,
    }),
    invoiceDate: invoiceDate!,
    dueDate: dueDate!,
    totalAmount: totalAmount!,
    ...(uploadRef && { uploadRef }),
    ...(lineItems && { lineItems }),
  }
}
