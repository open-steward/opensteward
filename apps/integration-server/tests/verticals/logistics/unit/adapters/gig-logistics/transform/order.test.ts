import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type GigOrder,
} from '../../../../../../../src/verticals/logistics/adapters/gig-logistics/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<GigOrder> = {}): GigOrder {
  return {
    id: 'gig-ord-001',
    orderNumber: 'ORD-1042',
    status: 'InTransit',
    customerId: 'cus-001',
    currency: 'NGN',
    senderDetail: {
      name: 'Alice Sender',
      address: '5 Lagos Road',
      city: 'Lagos',
      state: 'LA',
      country: 'NG',
    },
    receiverDetail: {
      name: 'Bob Receiver',
      address: '10 Abuja Way',
      city: 'Abuja',
      state: 'FC',
      country: 'NG',
    },
    waybillNumbers: ['WB111', 'WB222'],
    shipmentIds: ['shp-001'],
    totalAmount: 5000,
    shippingAmount: 1500,
    notes: 'Handle with care',
    orderedAt: '2024-03-01T00:00:00Z',
    shippedAt: '2024-03-01T06:00:00Z',
    deliveredAt: null,
    cancelledAt: null,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('gig-logistics transformOrder', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('gig-ord-001')
  })

  it('maps orderNumber', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('ORD-1042')
  })

  it('maps InTransit status → SHIPPED', () => {
    expect(transformOrder(makeOrder()).status).toBe('SHIPPED')
  })

  it('maps pending status → PENDING', () => {
    expect(transformOrder(makeOrder({ status: 'pending' })).status).toBe('PENDING')
  })

  it('maps Delivered status → DELIVERED', () => {
    expect(transformOrder(makeOrder({ status: 'Delivered' })).status).toBe('DELIVERED')
  })

  it('maps Cancelled status → CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps Returned status → RETURNED', () => {
    expect(transformOrder(makeOrder({ status: 'Returned' })).status).toBe('RETURNED')
  })

  it('maps null status → undefined', () => {
    expect(transformOrder(makeOrder({ status: null })).status).toBeUndefined()
  })

  it('maps customerId', () => {
    expect(transformOrder(makeOrder()).customerId).toBe('cus-001')
  })

  it('maps currency from raw', () => {
    expect(transformOrder(makeOrder()).currency).toBe('NGN')
  })

  it('uses GIG_DEFAULT_CURRENCY (NGN) when currency is null', () => {
    expect(transformOrder(makeOrder({ currency: null })).currency).toBe('NGN')
  })

  it('merges shipmentIds and waybillNumbers into shipmentIds', () => {
    const result = transformOrder(makeOrder())
    expect(result.shipmentIds).toEqual(['shp-001', 'WB111', 'WB222'])
  })

  it('maps totalAmount and shippingAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(5000)
    expect(result.shippingAmount).toBe(1500)
  })

  it('maps notes', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Handle with care')
  })

  it('maps originAddress name', () => {
    expect(transformOrder(makeOrder()).originAddress?.name).toBe('Alice Sender')
  })

  it('maps destinationAddress name', () => {
    expect(transformOrder(makeOrder()).destinationAddress?.name).toBe('Bob Receiver')
  })

  it('maps orderAt as Date', () => {
    expect(transformOrder(makeOrder()).orderAt).toBeInstanceOf(Date)
  })

  it('maps shippedAt as Date', () => {
    expect(transformOrder(makeOrder()).shippedAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as Date', () => {
    expect(transformOrder(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
