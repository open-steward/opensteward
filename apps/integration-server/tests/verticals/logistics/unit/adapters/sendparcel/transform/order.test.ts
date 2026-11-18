import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type SendParcelOrder,
} from '../../../../../../../src/verticals/logistics/adapters/sendparcel/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<SendParcelOrder> = {}): SendParcelOrder {
  return {
    id: 'ord-42',
    reference: 'REF-42',
    status: 'pending',
    customerId: 'cus-001',
    warehouseId: 'wh-001',
    senderAddress: {
      name: 'Sender Corp',
      street: '1 Sender St',
      city: 'Kaunas',
      countryCode: 'LT',
    },
    receiverAddress: {
      name: 'Receiver Inc',
      street: '99 Receiver Ave',
      city: 'Riga',
      countryCode: 'LV',
    },
    shipments: [
      { id: 'shp-001', status: 'created' },
      { id: 'shp-002', status: 'in_transit' },
    ],
    currency: 'EUR',
    totalAmount: 1200,
    shippingAmount: 300,
    notes: 'Fragile',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

// ─── transformOrder ───────────────────────────────────────────────────────────

describe('transformOrder', () => {
  it('maps id and orderNumber (reference)', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.id).toBe('ord-42')
    expect(result.orderNumber).toBe('REF-42')
  })

  it('maps customerId and warehouseId', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('cus-001')
    expect(result.warehouseId).toBe('wh-001')
  })

  it('collects shipment ids into shipmentIds array', () => {
    const result = transformOrder(makeOrder())
    expect(result.shipmentIds).toEqual(['shp-001', 'shp-002'])
  })

  it('maps sender → originAddress and receiver → destinationAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.name).toBe('Sender Corp')
    expect(result.originAddress?.city).toBe('Kaunas')
    expect(result.destinationAddress?.name).toBe('Receiver Inc')
    expect(result.destinationAddress?.country).toBe('LV')
  })

  it('maps currency, totalAmount, shippingAmount', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(1200)
    expect(result.shippingAmount).toBe(300)
  })

  it('maps notes', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Fragile')
  })

  it('parses createdAt and updatedAt as Dates', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes schema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('handles missing shipments gracefully (undefined shipmentIds)', () => {
    const result = transformOrder(makeOrder({ shipments: null }))
    expect(result.shipmentIds).toBeUndefined()
  })

  it('passes metadata as raw object reference', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
