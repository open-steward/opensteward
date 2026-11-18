/**
 * SaldeoSMART document → canonical Invoice transform.
 *
 * SaldeoSMART stores all document types (cost invoices, sales invoices,
 * correction invoices, receipts, etc.) as "documents" under the
 * document.list endpoint. This transform handles documents whose
 * DOCUMENT_TYPE.TYPE field indicates they are sales/income-type invoices:
 *   INVOICE, INVOICE_INCOME, INVOICE_PRO_FORMA, INVOICE_ADVANCE
 *
 * Key XML fields (from document_list_response.xml spec v1.23):
 *   DOCUMENT_ID, NUMBER, ISSUE_DATE, SALE_DATE, PAYMENT_DATE,
 *   DOCUMENT_TYPE (ID, NAME, SHORT_NAME, TYPE), CLASSIFICATION,
 *   CONTRACTOR.CONTRACTOR_ID, SUM, VAT_REGISTRIES (RATE/NETTO/VAT),
 *   CURRENCY_ISO4217, PAYMENT_TYPE, STAGE, IS_DOCUMENT_PAID, IS_CORRECTIVE
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { xmlTag, xmlBlocks } from '../client'
import { toIsoDatetime } from '@opensteward/shared'

export interface SaldeoDocumentVatRegistry {
  RATE: string
  NETTO: string
  VAT: string
}

export interface SaldeoDocument {
  DOCUMENT_ID: string
  NUMBER?: string
  ISSUE_DATE?: string
  SALE_DATE?: string
  PAYMENT_DATE?: string
  DOCUMENT_TYPE_TYPE?: string // e.g. INVOICE_COST, INVOICE_INCOME
  CONTRACTOR_ID?: string
  SUM?: string
  CURRENCY_ISO4217?: string
  PAYMENT_TYPE?: string
  STAGE?: string
  IS_DOCUMENT_PAID?: string
  IS_CORRECTIVE?: string
  VAT_REGISTRIES?: SaldeoDocumentVatRegistry[]
  _raw: string // raw XML block for metadata
}

/** Heuristic status mapping from SaldeoSMART stage + IS_DOCUMENT_PAID flag. */
function mapStatus(doc: SaldeoDocument): InvoiceStatus {
  if (doc.STAGE?.toLowerCase().includes('anulowan') || doc.STAGE?.toLowerCase().includes('cancel')) {
    return 'VOIDED'
  }
  if (doc.IS_DOCUMENT_PAID === 'true') return 'PAID'
  if (doc.STAGE?.toLowerCase().includes('zatwierdz') || doc.STAGE?.toLowerCase().includes('approv')) {
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

/** Sum all VAT amounts across registries. */
function totalVat(registries: SaldeoDocumentVatRegistry[]): number | undefined {
  if (!registries.length) return undefined
  let sum = 0
  for (const r of registries) {
    const v = parseFloat(r.VAT ?? '0')
    if (!isNaN(v)) sum += v
  }
  return Math.round(sum * 100)
}

/** Parse a SaldeoSMART XML document block into a SaldeoDocument. */
export function parseSaldeoDocument(xml: string): SaldeoDocument {
  const registryBlocks = xmlBlocks(xml, 'VAT_REGISTRY')
  const registries: SaldeoDocumentVatRegistry[] = registryBlocks.map((b) => ({
    RATE: xmlTag(b, 'RATE') ?? '',
    NETTO: xmlTag(b, 'NETTO') ?? '',
    VAT: xmlTag(b, 'VAT') ?? '',
  }))

  // CONTRACTOR is a nested element; get CONTRACTOR_ID from within CONTRACTOR block
  const contractorBlock = xmlTag(xml, 'CONTRACTOR') ?? ''
  const contractorId = xmlTag(contractorBlock, 'CONTRACTOR_ID') ?? xmlTag(xml, 'CONTRACTOR_ID')

  // DOCUMENT_TYPE.TYPE
  const docTypeBlock = xmlTag(xml, 'DOCUMENT_TYPE') ?? ''
  const docTypeType = xmlTag(docTypeBlock, 'TYPE') ?? xmlTag(xml, 'TYPE')

  return {
    DOCUMENT_ID: xmlTag(xml, 'DOCUMENT_ID') ?? '',
    NUMBER: xmlTag(xml, 'NUMBER'),
    ISSUE_DATE: xmlTag(xml, 'ISSUE_DATE'),
    SALE_DATE: xmlTag(xml, 'SALE_DATE'),
    PAYMENT_DATE: xmlTag(xml, 'PAYMENT_DATE'),
    DOCUMENT_TYPE_TYPE: docTypeType,
    CONTRACTOR_ID: contractorId,
    SUM: xmlTag(xml, 'SUM'),
    CURRENCY_ISO4217: xmlTag(xml, 'CURRENCY_ISO4217'),
    PAYMENT_TYPE: xmlTag(xml, 'PAYMENT_TYPE'),
    STAGE: xmlTag(xml, 'STAGE'),
    IS_DOCUMENT_PAID: xmlTag(xml, 'IS_DOCUMENT_PAID'),
    IS_CORRECTIVE: xmlTag(xml, 'IS_CORRECTIVE'),
    VAT_REGISTRIES: registries,
    _raw: xml,
  }
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

export function transformInvoice(doc: SaldeoDocument): Invoice {
  const sum = safeFloat(doc.SUM)
  const totalAmount = sum !== undefined ? Math.round(sum * 100) : undefined
  const vatAmount = doc.VAT_REGISTRIES ? totalVat(doc.VAT_REGISTRIES) : undefined

  return {
    id: doc.DOCUMENT_ID || undefined,
    type: 'INVOICE',
    status: mapStatus(doc),
    invoiceNumber: doc.NUMBER || undefined,
    contactId: doc.CONTRACTOR_ID ? String(doc.CONTRACTOR_ID) : undefined,
    currency: doc.CURRENCY_ISO4217 || undefined,
    totalAmount,
    taxAmount: vatAmount,
    postedAt: toDate(doc.ISSUE_DATE),
    dueAt: toDate(doc.PAYMENT_DATE),
    metadata: { _xml: doc._raw } as Record<string, unknown>,
  }
}
