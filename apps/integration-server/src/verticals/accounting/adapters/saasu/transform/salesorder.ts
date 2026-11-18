/**
 * Saasu "Sale Order" → canonical SalesOrder. See ./order.ts for the doc
 * citations: a sale order is an invoice with `InvoiceType` "Sale Order" and
 * `TransactionType` 'S' (https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs).
 */
import type { SalesOrder } from '../../../schema/salesorder'
import type { SaasuInvoiceDetail, SaasuInvoiceSummary } from '../invoice-shapes'
import { orderFields } from './order'

export function transformSalesOrder(raw: SaasuInvoiceSummary | SaasuInvoiceDetail): SalesOrder {
  return orderFields(raw)
}
