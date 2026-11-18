import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type FortnoxOrder,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/order'

function makeOrder(overrides: Partial<FortnoxOrder> = {}): FortnoxOrder {
  return {
    DocumentNumber: 'ORD-10',
    CustomerNumber: 'C001',
    CustomerName: 'Acme AB',
    Currency: 'SEK',
    Total: 5000,
    OrderDate: '2024-04-01',
    Status: 'ongoing',
    DeliveryAddress1: '',
    DeliveryAddress2: '',
    DeliveryCity: '',
    DeliveryZipCode: '',
    DeliveryCountryCode: '',
    Address1: 'Storgatan 1',
    Address2: '',
    City: 'Stockholm',
    ZipCode: '11122',
    CountryCode: 'SE',
    OrderRows: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps DocumentNumber to id', () => {
    expect(transformOrder(makeOrder()).id).toBe('ORD-10')
  })

  it('maps CustomerNumber to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('cust_C001')
  })

  it('maps Currency to currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('SEK')
  })

  it('maps Total to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(500000)
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps status ACTIVE for ongoing orders', () => {
    expect(transformOrder(makeOrder({ Status: 'ongoing' })).status).toBe('ACTIVE')
  })

  it('maps status COMPLETED for invoiced orders', () => {
    expect(transformOrder(makeOrder({ Status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED for cancelled orders', () => {
    expect(transformOrder(makeOrder({ Status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps OrderDate to postedAt as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-04-01')).toBe(true)
  })

  it('maps billing address fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.address1).toBe('Storgatan 1')
    expect(result.billingAddress?.city).toBe('Stockholm')
    expect(result.billingAddress?.postalCode).toBe('11122')
    expect(result.billingAddress?.country).toBe('SE')
  })

  it('maps shipping address when delivery fields are present', () => {
    const raw = makeOrder({
      DeliveryAddress1: 'Kungsgatan 5',
      DeliveryCity: 'Gothenburg',
      DeliveryZipCode: '41104',
      DeliveryCountryCode: 'SE',
    })
    const result = transformOrder(raw)
    expect(result.shippingAddress?.address1).toBe('Kungsgatan 5')
    expect(result.shippingAddress?.city).toBe('Gothenburg')
  })

  it('returns undefined shippingAddress when no delivery fields', () => {
    expect(transformOrder(makeOrder()).shippingAddress).toBeUndefined()
  })

  it('maps OrderRows to lineItems', () => {
    const raw = makeOrder({
      OrderRows: [
        {
          RowId: 1,
          ArticleNumber: 'ART01',
          Description: 'Widget',
          Price: 500,
          OrderedQuantity: 10,
          Total: 5000,
          VAT: 1000,
          AccountNumber: '3000',
          Discount: 0,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].itemId).toBe('ART01')
    expect(result.lineItems![0].totalAmount).toBe(500000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
