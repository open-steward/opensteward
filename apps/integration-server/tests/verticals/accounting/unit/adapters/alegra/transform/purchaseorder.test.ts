import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type AlegraPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<AlegraPurchaseOrder> = {}): AlegraPurchaseOrder {
  return {
    id: 70,
    providerId: 4,
    currency: 'COP',
    total: 6000,
    date: '2024-01-15',
    status: 'open',
    deliveryAddress: 'Bodega 1',
    deliveryCity: 'Cali',
    deliveryDepartment: 'Valle del Cauca',
    deliveryCountry: 'CO',
    items: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id to string', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('70')
  })

  it('maps providerId to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('4')
  })

  it('maps total', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(6000)
  })

  it('maps status ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps status COMPLETED for completed', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status COMPLETED for received', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps date as Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps delivery address to shippingAddress', () => {
    const po = transformPurchaseOrder(makePurchaseOrder())
    expect(po.shippingAddress?.address1).toBe('Bodega 1')
    expect(po.shippingAddress?.city).toBe('Cali')
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
