import { toDate } from '../../shared/transform'
/**
 * WhiteBooks e-Invoice (IRN) ↔ canonical Invoice transforms.
 *
 * WhiteBooks wraps the NIC IRP e-Invoice schema (V1.03):
 *   POST /einvoice/type/GENERATE/version/V1_03  → IRN + signed payload
 *   GET  /einvoice/type/GETIRN/version/V1_03    → same shape
 *
 * Key WhiteBooks IRN response fields:
 *   Irn, AckNo, AckDt, signedInvoice, signedQRCode
 *
 * The signed invoice payload (base64-decoded JSON) contains the full NIC schema
 * including DocDtls, SellerDtls, BuyerDtls, ItemList, ValDtls.
 * We map those fields to the canonical Invoice type.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── WhiteBooks / NIC IRP types ────────────────────────────────────────────────

export interface WhitebooksIrnItem {
  SlNo: string
  PrdDesc?: string
  HsnCd?: string
  Qty?: number
  Unit?: string
  UnitPrice?: number
  TotAmt?: number
  AssAmt?: number
  GstRt?: number
  IgstAmt?: number
  CgstAmt?: number
  SgstAmt?: number
  TotItemVal?: number
  [key: string]: unknown
}

export interface WhitebooksDocDtls {
  Typ: string   // "INV" | "CRN" | "DBN"
  No: string    // invoice / document number
  Dt: string    // "DD/MM/YYYY"
  [key: string]: unknown
}

export interface WhitebooksValDtls {
  AssVal?: number    // total assessable value
  IgstVal?: number   // IGST
  CgstVal?: number   // CGST
  SgstVal?: number   // SGST
  TotInvVal?: number // grand total
  [key: string]: unknown
}

export interface WhitebooksBuyerDtls {
  Gstin?: string
  LglNm?: string
  TrdNm?: string
  Addr1?: string
  Addr2?: string
  Loc?: string
  Pin?: number | string
  Stcd?: string
  [key: string]: unknown
}

/**
 * The outer IRN response returned by WhiteBooks (both generate and fetch).
 */
export interface WhitebooksIrnResponse {
  Irn?: string
  AckNo?: string
  AckDt?: string         // "YYYY-MM-DD HH:mm:ss"
  signedInvoice?: string // base64 JWT — payload is the full NIC JSON
  signedQRCode?: string
  // The embedded NIC invoice body (available when fetching by IRN)
  DocDtls?: WhitebooksDocDtls
  ValDtls?: WhitebooksValDtls
  BuyerDtls?: WhitebooksBuyerDtls
  ItemList?: WhitebooksIrnItem[]
  EwbNo?: string | number
  EwbDt?: string
  // Status present when cancelled
  Status?: string
  CancelDate?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a WhiteBooks/NIC monetary value (full INR, floating-point) to the
 * canonical integer minor-unit representation (paise; 1 INR = 100 paise).
 * Returns undefined when the input is null/undefined/NaN.
 */
function toMinorUnits(val: number | null | undefined): number | undefined {
  if (val == null || !Number.isFinite(val)) return undefined
  return Math.round(val * 100)
}

/**
 * Convert a canonical minor-unit amount (paise) back to full INR rupees for
 * the WhiteBooks/NIC API request body.  Returns undefined for missing values.
 */
function fromMinorUnits(val: number | null | undefined): number | undefined {
  if (val == null || !Number.isFinite(val)) return undefined
  return val / 100
}

/**
 * Parse "DD/MM/YYYY" or "YYYY-MM-DD HH:mm:ss" into a Date (never throws).
 */
function parseWbDate(val?: string | null): Date | undefined {
  if (!val) return undefined
  try {
    // NIC date format: "DD/MM/YYYY"
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
      const [d, m, y] = val.split('/')
      return new Date(`${y}-${m}-${d}T00:00:00Z`)
    }
    const d = new Date(val)
    return isNaN(d.getTime()) ? undefined : d
  } catch {
    return undefined
  }
}

function mapDocType(typ?: string): Invoice['type'] {
  const t = (typ ?? '').toUpperCase()
  if (t === 'CRN') return 'CREDITMEMO'
  return 'INVOICE'
}

function mapStatus(raw: WhitebooksIrnResponse): InvoiceStatus {
  if (raw.Status === 'CNL' || raw.CancelDate) return 'VOIDED'
  if (raw.Irn) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(item: WhitebooksIrnItem): Lineitem {
  // WhiteBooks/NIC amounts are full INR (floating-point); convert to paise.
  const rawTax = (item.IgstAmt ?? 0) + (item.CgstAmt ?? 0) + (item.SgstAmt ?? 0)
  const taxAmount = rawTax !== 0 ? Math.round(rawTax * 100) : undefined
  return {
    id: item.SlNo || undefined,
    itemDescription: item.PrdDesc || undefined,
    itemSku: item.HsnCd || undefined,
    unitAmount: toMinorUnits(item.UnitPrice),
    unitQuantity: item.Qty != null ? Math.round(item.Qty) : undefined,
    totalAmount: toMinorUnits(item.TotItemVal ?? item.TotAmt),
    taxAmount,
  }
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformInvoice(raw: WhitebooksIrnResponse): Invoice {
  const docNo = raw.DocDtls?.No || raw.Irn || raw.AckNo
  return {
    id: raw.Irn || raw.AckNo || raw.DocDtls?.No || undefined,
    type: mapDocType(raw.DocDtls?.Typ),
    status: mapStatus(raw),
    invoiceNumber: docNo || undefined,
    contactId: raw.BuyerDtls?.Gstin || undefined,
    currency: 'INR',
    // WhiteBooks/NIC amounts are full INR (floating-point); convert to paise.
    totalAmount: toMinorUnits(raw.ValDtls?.TotInvVal),
    taxAmount: (() => {
      const rawTax =
        (raw.ValDtls?.IgstVal ?? 0) +
        (raw.ValDtls?.CgstVal ?? 0) +
        (raw.ValDtls?.SgstVal ?? 0)
      return rawTax !== 0 ? Math.round(rawTax * 100) : undefined
    })(),
    lineItems: raw.ItemList?.map(mapLineitem) ?? undefined,
    postedAt: parseWbDate(raw.DocDtls?.Dt),
    cancelledAt: parseWbDate(raw.CancelDate),
    createdAt: parseWbDate(raw.AckDt),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Reverse transform (canonical Invoice → WhiteBooks IRN request body) ───────

/**
 * Build the NIC V1.03 IRN generation request from a canonical Invoice.
 * Only the fields WhiteBooks requires are mapped; the caller must supply
 * SellerDtls (from the authenticated GSTIN) separately.
 */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  const postedDate = toDate(invoice.postedAt)
  const postedStr = postedDate
    ? [
        String(postedDate.getUTCDate()).padStart(2, '0'),
        String(postedDate.getUTCMonth() + 1).padStart(2, '0'),
        String(postedDate.getUTCFullYear()),
      ].join('/')
    : undefined

  // Canonical amounts are integer paise; WhiteBooks/NIC API expects full INR.
  const items = invoice.lineItems?.map((li, idx) => ({
    SlNo: li.id ?? String(idx + 1),
    PrdDesc: li.itemDescription,
    HsnCd: li.itemSku,
    Qty: li.unitQuantity,
    Unit: 'NOS',
    UnitPrice: fromMinorUnits(li.unitAmount),
    TotAmt: fromMinorUnits(li.totalAmount),
    AssAmt: fromMinorUnits(li.totalAmount),
    GstRt: 0,
    IgstAmt: li.taxAmount != null ? li.taxAmount / 100 : 0,
    TotItemVal: fromMinorUnits(li.totalAmount),
  }))

  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B' },
    DocDtls: {
      Typ: invoice.type === 'CREDITMEMO' ? 'CRN' : 'INV',
      No: invoice.invoiceNumber ?? invoice.id,
      Dt: postedStr,
    },
    BuyerDtls: invoice.contactId
      ? { Gstin: invoice.contactId, LglNm: '', Pos: '00', Addr1: '', Loc: '', Pin: 0, Stcd: '00' }
      : undefined,
    ItemList: items,
    ValDtls: {
      AssVal: fromMinorUnits(invoice.totalAmount),
      IgstVal: invoice.taxAmount != null ? invoice.taxAmount / 100 : 0,
      TotInvVal: fromMinorUnits(invoice.totalAmount),
    },
  }
}
