/**
 * Access Financials outstanding purchase order header → canonical
 * PurchaseOrder.
 *
 * Read from `purchasing.transactions.outstandingPurchaseOrders.header`. The
 * documented example selects "orderNumber orderType orderStatus accountCode
 * accountName orderDate orderGross netOutstanding ... requiredDate
 * completionDate auditNo ... currencyGross currencyNetOutstanding
 * currencySymbol ..." and answers with `"orderNumber": "5000", "orderType":
 * "Order", "orderStatus": "Outstanding"`
 * (https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/purchasing-transactions).
 * The live schema types `orderNumber: String`, `orderDate: DateOnly`,
 * `orderStatus: OrderStatus` (Complete, Outstanding).
 *
 * The id is `orderNumber`, which `getPurchaseOrder` filters on.
 * `contactId` is `supp_<accountCode>`. Money is left out for the reason
 * given in `./invoice` (the example shows "orderGross": 1065.24 beside
 * "currencyGross": 0 and "currencySymbol": "GBP").
 */
import type { PurchaseOrder } from '../../../schema/purchaseorder'
import { toCalendarDate } from '../../shared/transform'
import { supplierContactId } from './bill'
import { mapOrderStatus } from './salesorder'

/** The documented `OutstandingPurchaseOrderHeader` fields this adapter selects. */
export interface AFPurchaseOrderHeader {
  orderNumber: string
  orderType?: string | null
  orderStatus?: string | null
  accountCode?: string | null
  accountName?: string | null
  orderDate?: string | null
  requiredDate?: string | null
  orderGross?: number | null
  netOutstanding?: number | null
  currencyGross?: number | null
  currencyNetOutstanding?: number | null
  currencySymbol?: string | null
}

export function transformPurchaseOrder(raw: AFPurchaseOrderHeader): PurchaseOrder {
  return {
    id: raw.orderNumber,
    status: mapOrderStatus(raw.orderStatus),
    contactId: supplierContactId(raw.accountCode),
    postedAt: toCalendarDate(raw.orderDate),
    metadata: { ...raw },
  }
}
