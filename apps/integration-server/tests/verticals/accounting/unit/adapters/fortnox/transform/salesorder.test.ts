import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type FortnoxSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/salesorder'

function makeSalesOrder(overrides: Partial<FortnoxSalesOrder> = {}): FortnoxSalesOrder {
  return {
    DocumentNumber: 'SO-99',
    CustomerNumber: 'C002',
    CustomerName: 'Beta AB',
    Currency: 'SEK',
    Total: 8000,
    OrderDate: '2024-05-15',
    Status: 'ongoing',
    DeliveryAddress1: '',
    DeliveryAddress2: '',
    DeliveryCity: '',
    DeliveryZipCode: '',
    DeliveryCountryCode: '',
    Address1: '',
    Address2: '',
    City: '',
    ZipCode: '',
    CountryCode: '',
    OrderRows: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps DocumentNumber to id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('SO-99')
  })

  it('maps CustomerNumber to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('cust_C002')
  })

  it('maps Currency to currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('SEK')
  })

  it('maps Total to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(800000)
  })

  it('maps status ACTIVE for ongoing orders', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'ongoing' })).status).toBe('ACTIVE')
  })

  it('maps status COMPLETED for invoiced orders', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED for cancelled orders', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps OrderDate to postedAt as Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-05-15')).toBe(true)
  })

  it('maps OrderRows to lineItems', () => {
    const raw = makeSalesOrder({
      OrderRows: [
        {
          RowId: 2,
          ArticleNumber: 'ART02',
          Description: 'Gadget',
          Price: 800,
          OrderedQuantity: 10,
          Total: 8000,
          VAT: 1600,
          AccountNumber: '3001',
          Discount: 0,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('2')
    expect(result.lineItems![0].totalAmount).toBe(800000)
  })

  it('maps shipping address when delivery fields are present', () => {
    const raw = makeSalesOrder({
      DeliveryAddress1: 'Drottninggatan 10',
      DeliveryCity: 'Malmö',
      DeliveryZipCode: '21120',
      DeliveryCountryCode: 'SE',
    })
    const result = transformSalesOrder(raw)
    expect(result.shippingAddress?.address1).toBe('Drottninggatan 10')
    expect(result.shippingAddress?.city).toBe('Malmö')
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
