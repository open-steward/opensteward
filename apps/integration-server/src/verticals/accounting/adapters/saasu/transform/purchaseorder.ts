/**
 * Saasu "Purchase Order" → canonical PurchaseOrder. See ./order.ts for the
 * doc citations: a purchase order is an invoice with `InvoiceType`
 * "Purchase Order" and `TransactionType` 'P'
 * (https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs).
 */
import type { PurchaseOrder } from '../../../schema/purchaseorder'
import type { SaasuInvoiceDetail, SaasuInvoiceSummary } from '../invoice-shapes'
import { orderFields } from './order'

export function transformPurchaseOrder(
  raw: SaasuInvoiceSummary | SaasuInvoiceDetail,
): PurchaseOrder {
  return orderFields(raw)
}
