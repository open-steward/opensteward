import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type FortnoxPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<FortnoxPurchaseOrder> = {}): FortnoxPurchaseOrder {
  return {
    DocumentNumber: 'PO-55',
    SupplierNumber: 'S007',
    SupplierName: 'Gamma Leverantör AB',
    Currency: 'SEK',
    TotalWithVAT: 6250,
    OrderDate: '2024-06-01',
    Status: 'active',
    DeliveryAddress1: '',
    DeliveryAddress2: '',
    DeliveryCity: '',
    DeliveryZipCode: '',
    DeliveryCountryCode: '',
    OurReference: 'EJ',
    YourReference: 'KL',
    PurchaseOrderRows: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps DocumentNumber to id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('PO-55')
  })

  it('maps SupplierNumber to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('supp_S007')
  })

  it('maps Currency to currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('SEK')
  })

  it('maps TotalWithVAT to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(625000)
  })

  it('maps status ACTIVE for active orders', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps status COMPLETED for received orders', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED for cancelled orders', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps OrderDate to postedAt as Date', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-06-01')).toBe(true)
  })

  it('maps PurchaseOrderRows to lineItems', () => {
    const raw = makePurchaseOrder({
      PurchaseOrderRows: [
        {
          RowId: 1,
          ArticleNumber: 'RAW01',
          Description: 'Steel rods',
          Price: 250,
          OrderedQuantity: 25,
          Total: 6250,
          AccountNumber: '4000',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].itemId).toBe('RAW01')
    expect(result.lineItems![0].totalAmount).toBe(625000)
    expect(result.lineItems![0].accountId).toBe('4000')
  })

  it('maps delivery address to shippingAddress when present', () => {
    const raw = makePurchaseOrder({
      DeliveryAddress1: 'Industrivägen 3',
      DeliveryCity: 'Uppsala',
      DeliveryZipCode: '75321',
      DeliveryCountryCode: 'SE',
    })
    const result = transformPurchaseOrder(raw)
    expect(result.shippingAddress?.address1).toBe('Industrivägen 3')
    expect(result.shippingAddress?.city).toBe('Uppsala')
    expect(result.shippingAddress?.postalCode).toBe('75321')
  })

  it('returns undefined shippingAddress when no delivery fields', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).shippingAddress).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
