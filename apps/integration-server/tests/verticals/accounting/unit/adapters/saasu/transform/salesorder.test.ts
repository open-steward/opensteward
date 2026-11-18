/** Saasu "Sale Order" → SalesOrder, over the documented samples. */
import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/salesorder'
import { invoiceDetail } from '../fixtures'

describe('transformSalesOrder (saasu)', () => {
  it('maps the documented fields, amounts in minor units', () => {
    const so = SalesOrderSchema.parse(
      transformSalesOrder(invoiceDetail({ InvoiceType: 'Sale Order' })),
    )
    expect(so).toMatchObject({
      id: '5093684',
      status: 'ACTIVE',
      contactId: '1568986',
      currency: 'AUD',
      totalAmount: 1045,
      lineAmountsIncludeTax: true,
    })
    expect(so.lineItems![0]).toMatchObject({ unitAmount: 1150, totalAmount: 1045 })
  })
})
