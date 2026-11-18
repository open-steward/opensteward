/**
 * Access Financials outstanding sales order header → canonical SalesOrder.
 *
 * Read from `selling.transactions.outstandingSalesOrders.header`. The
 * documented example selects "orderNumber orderType orderStatus workStatus
 * accountCode accountName customerRef orderDate orderGross netOutstanding
 * ... requiredDate enteredDate completionDate auditNo ... currencyGross
 * currencyNetOutstanding currencySymbol ..." and answers with
 * `"orderNumber": 3000, "orderType": "Order", "orderStatus": "Complete"`
 * (https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/selling-transactions).
 * The live schema types `orderNumber: Int`, `orderDate: DateOnly`,
 * `orderStatus: OrderStatus` (Complete, Outstanding).
 *
 * The id is `orderNumber`, which `getSalesOrder` filters on. Status maps the
 * two documented `OrderStatus` values; any other value is `unknown`. Money is
 * left out for the reason given in `./invoice`: the example itself shows
 * "orderGross": 408 beside "currencyGross": 0 and "currencySymbol": "GBP",
 * so which currency `orderGross` is in is not stated.
 */
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import { toCalendarDate } from '../../shared/transform'
import { customerContactId } from './invoice'

/** The documented `OutstandingSalesOrderHeader` fields this adapter selects. */
export interface AFSalesOrderHeader {
  orderNumber: number
  orderType?: string | null
  orderStatus?: string | null
  accountCode?: string | null
  accountName?: string | null
  customerRef?: string | null
  orderDate?: string | null
  requiredDate?: string | null
  orderGross?: number | null
  netOutstanding?: number | null
  currencyGross?: number | null
  currencyNetOutstanding?: number | null
  currencySymbol?: string | null
}

/** `OrderStatus`: "Complete" or "Outstanding". Absent stays absent. */
export function mapOrderStatus(status: string | null | undefined): SalesOrderStatus | undefined {
  if (status == null) return undefined
  if (status === 'Complete') return 'COMPLETED'
  if (status === 'Outstanding') return 'ACTIVE'
  return 'unknown'
}

export function transformSalesOrder(raw: AFSalesOrderHeader): SalesOrder {
  return {
    id: String(raw.orderNumber),
    status: mapOrderStatus(raw.orderStatus),
    contactId: customerContactId(raw.accountCode),
    postedAt: toCalendarDate(raw.orderDate),
    metadata: { ...raw },
  }
}
