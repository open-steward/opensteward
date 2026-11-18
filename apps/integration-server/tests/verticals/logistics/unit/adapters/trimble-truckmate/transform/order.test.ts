import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type TrimbleTruckmateOrderResponse,
} from '../../../../../../../src/verticals/logistics/adapters/trimble-truckmate/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(
  overrides: Partial<TrimbleTruckmateOrderResponse> = {},
): TrimbleTruckmateOrderResponse {
  return {
    orderId: 'ORD-001',
    orderNumber: 'ON-001',
    status: 'IN_TRANSIT',
    customerId: 'CUST-001',
    warehouseId: 'WH-001',
    shipmentIds: ['SHP-001'],
    origin: {
      name: 'Alice',
      address: '1 Origin St',
      city: 'Atlanta',
      state: 'GA',
      zipCode: '30301',
      country: 'US',
    },
    destination: {
      name: 'Bob',
      address: '2 Dest Blvd',
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
      country: 'US',
    },
    lineItems: [
      {
        lineId: 'LI-001',
        sku: 'SKU-123',
        name: 'Widget',
        quantity: 3,
        unitPrice: 10,
        totalPrice: 30,
        weight: 1.5,
        weightUnit: 'lb',
      },
    ],
    currency: 'USD',
    subtotalAmount: 30,
    taxAmount: 2.5,
    shippingAmount: 5,
    totalAmount: 37.5,
    notes: 'Fragile',
    serviceCode: 'LTL',
    orderDate: '2024-03-01T00:00:00Z',
    shippedDate: '2024-03-02T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('trimble-truckmate transformOrder', () => {
  it('maps id from orderId', () => {
    expect(transformOrder(makeOrder()).id).toBe('ORD-001')
  })

  it('maps orderNumber', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('ON-001')
  })

  it('maps status IN_TRANSIT to SHIPPED', () => {
    // ORDER_STATUS_MAP: IN_TRANSIT → 'SHIPPED'
    expect(transformOrder(makeOrder()).status).toBe('SHIPPED')
  })

  it('maps DELIVERED status', () => {
    // ORDER_STATUS_MAP: DELIVERED → 'DELIVERED'
    expect(transformOrder(makeOrder({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps customerId', () => {
    expect(transformOrder(makeOrder()).customerId).toBe('CUST-001')
  })

  it('maps origin address', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.city).toBe('Atlanta')
    expect(result.originAddress?.state).toBe('GA')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destination address', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.city).toBe('Miami')
    expect(result.destinationAddress?.postalCode).toBe('33101')
  })

  it('converts subtotalAmount to minor units', () => {
    // 30 dollars → 3000 cents
    expect(transformOrder(makeOrder()).subtotalAmount).toBe(3000)
  })

  it('converts totalAmount to minor units', () => {
    // 37.5 dollars → 3750 cents
    expect(transformOrder(makeOrder()).totalAmount).toBe(3750)
  })

  it('maps lineitem fields', () => {
    const li = transformOrder(makeOrder()).lineItems![0]
    expect(li.id).toBe('LI-001')
    expect(li.sku).toBe('SKU-123')
    expect(li.name).toBe('Widget')
    expect(li.quantity).toBe(3)
    expect(li.unitAmount).toBe(1000) // 10 * 100
    expect(li.totalAmount).toBe(3000) // 30 * 100
    expect(li.weight?.value).toBe(1.5)
    expect(li.weight?.unit).toBe('lb')
  })

  it('maps requestedServiceCode from serviceCode', () => {
    expect(transformOrder(makeOrder()).requestedServiceCode).toBe('LTL')
  })

  it('maps orderAt and shippedAt as Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderAt).toBeInstanceOf(Date)
    expect(result.shippedAt).toBeInstanceOf(Date)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('maps notes', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Fragile')
  })

  it('passes metadata through', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
