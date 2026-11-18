/**
 * ERPAG purchase order transform.
 *
 * GET /purchaseorder?id={id} response shape:
 * {
 *   purchaseOrder: { documentNumber, documentDate, referenceNo, termsOfTrade, internationalTrade, dropShipping }
 *   supplier: { supplier, eMail, taxIdentificationNumber, taxLocation, termsOfPayment }
 *   amount: { purchaseAmount, landingCost, inputTax, purchaseAmountTaxIncl, total }
 *   items: [{ productsAndServices: { sku, description, eanUpc }, defaultUom: { quantity, uom }, price?, total? }]
 *   taxes: [{ inputTax: { description, amount } }]
 * }
 *
 * The supplier's `key` (id) and supplierId are derived from the supplier name only — ERPAG does not
 * return the supplier key directly in the purchase order response, so we use the name as a
 * fallback identifier when no key is available.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawErpagPoDocument {
  documentNumber?: string
  documentDate?: string
  referenceNo?: string
  termsOfTrade?: string
  internationalTrade?: boolean
  dropShipping?: boolean
  [key: string]: unknown
}

export interface RawErpagPoSupplier {
  key?: string
  supplier?: string
  eMail?: string
  taxIdentificationNumber?: string
  taxLocation?: string
  termsOfPayment?: string
  [key: string]: unknown
}

export interface RawErpagPoAmount {
  purchaseAmount?: number
  landingCost?: number
  inputTax?: number
  purchaseAmountTaxIncl?: number
  total?: number
  [key: string]: unknown
}

export interface RawErpagPoItem {
  productsAndServices?: { sku?: string; description?: string; eanUpc?: string; key?: string }
  defaultUom?: { quantity?: number; uom?: string }
  price?: number
  total?: number
  [key: string]: unknown
}

export interface RawErpagPurchaseOrder {
  /** Injected by the adapter from the /purchaseorders list id. */
  id: string
  purchaseOrder?: RawErpagPoDocument
  supplier?: RawErpagPoSupplier
  amount?: RawErpagPoAmount
  items?: RawErpagPoItem[]
  [key: string]: unknown
}

function mapStatus(_s: string | undefined): PurchaseOrderStatus {
  // ERPAG does not expose a status field in the documented GET /purchaseorder
  // response shape; default to 'sent' (it exists as a document in the system).
  return 'sent'
}

export function transformPurchaseOrder(raw: RawErpagPurchaseOrder): PurchaseOrder {
  const doc = raw.purchaseOrder ?? {}
  const sup = raw.supplier ?? {}
  const amt = raw.amount ?? {}

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(doc.documentNumber),
    supplierId: pickStr(sup.key) ?? pickStr(sup.supplier) ?? '',
    status: mapStatus(undefined),
    subtotalAmount: pickNum(amt.purchaseAmount),
    totalAmount: pickNum(amt.total),
    lines: (raw.items ?? []).map((line) => ({
      productId: pickStr(line.productsAndServices?.key) ?? pickStr(line.productsAndServices?.sku) ?? '',
      quantityOrdered: pickNum(line.defaultUom?.quantity) ?? 0,
      unitCost: pickNum(line.price),
      lineTotal: pickNum(line.total),
    })),
    orderedAt: toIso(doc.documentDate),
    platform: 'erpag',
    metadata: strMap({
      referenceNo: doc.referenceNo,
      termsOfTrade: doc.termsOfTrade,
      supplierEmail: sup.eMail,
      termsOfPayment: sup.termsOfPayment,
    }),
    raw,
  }
}
