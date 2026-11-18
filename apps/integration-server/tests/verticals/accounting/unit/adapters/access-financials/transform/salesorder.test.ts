/**
 * Outstanding sales order header → SalesOrder.
 *
 * The fixture is the documented response of "Get Outstanding Sales Orders"
 * on
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/selling-transactions,
 * cut to the fields this adapter selects, with `orderDate` in the schema's
 * `DateOnly` format ("Format is `yyyy-MM-dd`"; the example prints
 * "2023-05-10T00:00:00").
 */
import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  mapOrderStatus,
} from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { salesOrderHeader } from '../fixtures'

describe('transformSalesOrder (access-financials)', () => {
  it('parses as a canonical SalesOrder', () => {
    expect(() => SalesOrderSchema.parse(transformSalesOrder(salesOrderHeader()))).not.toThrow()
  })

  it('maps the documented example', () => {
    const so = transformSalesOrder(salesOrderHeader())
    expect(so.id).toBe('3000')
    expect(so.status).toBe('COMPLETED')
    expect(so.contactId).toBe('cust_GB-12686')
    expect(so.postedAt).toBe('2023-05-10')
  })

  it('reports no money and no currency', () => {
    const so = transformSalesOrder(salesOrderHeader())
    expect(so.totalAmount).toBeUndefined()
    expect(so.currency).toBeUndefined()
    expect(so.metadata).toMatchObject({ orderGross: 408 })
  })
})

describe('mapOrderStatus', () => {
  it('maps the two OrderStatus values', () => {
    expect(mapOrderStatus('Complete')).toBe('COMPLETED')
    expect(mapOrderStatus('Outstanding')).toBe('ACTIVE')
  })

  it('an undocumented value is unknown, and an absent one stays absent', () => {
    expect(mapOrderStatus('Held')).toBe('unknown')
    expect(mapOrderStatus(null)).toBeUndefined()
  })
})
