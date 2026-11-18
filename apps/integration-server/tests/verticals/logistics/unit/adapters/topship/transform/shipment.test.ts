import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type TopshipShipment,
} from '../../../../../../../src/verticals/logistics/adapters/topship/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<TopshipShipment> = {}): TopshipShipment {
  return {
    id: 'ts-001',
    trackingId: 'TTRK001',
    shipmentStatus: 'InTransit',
    pricingTier: 'Premium',
    totalCharge: 5000,
    currency: 'NGN',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    senderDetail: {
      name: 'Alice',
      addressLine1: '1 Allen Ave',
      city: 'Lagos',
      country: 'NG',
    },
    receiverDetail: {
      name: 'Bob',
      addressLine1: '2 Main St',
      city: 'Abuja',
      country: 'NG',
    },
    items: [
      { description: 'Book', weight: 1.0 },
      { description: 'Pen', weight: 0.5 },
    ],
    dimension: { length: 30, width: 20, height: 10 },
    label: 'https://labels.topship.africa/ts-001.pdf',
    createdDate: '2024-03-01T00:00:00Z',
    updatedDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('topship transformShipment', () => {
  it('maps id', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('ts-001')
  })

  it('maps trackingId → trackingNumber', () => {
    const r = transformShipment(makeShipment())
    expect(r.trackingNumber).toBe('TTRK001')
  })

  it('maps InTransit → IN_TRANSIT', () => {
    const r = transformShipment(makeShipment())
    expect(r.status).toBe('IN_TRANSIT')
  })

  it('maps senderDetail → originAddress', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.name).toBe('Alice')
    expect(r.originAddress?.city).toBe('Lagos')
  })

  it('maps receiverDetail → destinationAddress', () => {
    const r = transformShipment(makeShipment())
    expect(r.destinationAddress?.name).toBe('Bob')
  })

  it('sums items weights → totalWeight', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(1.5)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('maps dimension → dimensions in cm', () => {
    const r = transformShipment(makeShipment())
    expect(r.dimensions?.length).toBe(30)
    expect(r.dimensions?.unit).toBe('cm')
  })

  it('maps totalCharge → cost.amount and currency', () => {
    const r = transformShipment(makeShipment())
    expect(r.cost?.amount).toBe(5000)
    expect(r.cost?.currency).toBe('NGN')
  })

  it('falls back to shipmentCharge when totalCharge absent', () => {
    const r = transformShipment(makeShipment({ totalCharge: null, shipmentCharge: 3000 }))
    expect(r.cost?.amount).toBe(3000)
  })

  it('maps label → labelUrl', () => {
    const r = transformShipment(makeShipment())
    expect(r.labelUrl).toBe('https://labels.topship.africa/ts-001.pdf')
  })

  it('maps estimatedDeliveryDate → estimatedDeliveryAt as Date', () => {
    const r = transformShipment(makeShipment())
    expect(r.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdDate → createdAt as Date', () => {
    const r = transformShipment(makeShipment())
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('metadata references the raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('maps status values correctly', () => {
    const cases: Array<[string, string]> = [
      ['draft', 'PENDING'],
      ['PaymentPending', 'PENDING'],
      ['payment_pending', 'PENDING'],
      ['Confirmed', 'LABEL_CREATED'],
      ['AwaitingPickup', 'LABEL_CREATED'],
      ['awaiting_pickup', 'LABEL_CREATED'],
      ['intransit', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['OutForDelivery', 'OUT_FOR_DELIVERY'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['DeliveryFailed', 'EXCEPTION'],
      ['delivery_failed', 'EXCEPTION'],
      ['PickupFailed', 'EXCEPTION'],
      ['bogus', 'UNKNOWN'],
    ]
    for (const [s, expected] of cases) {
      expect(transformShipment(makeShipment({ shipmentStatus: s })).status).toBe(expected)
    }
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('handles null items → no totalWeight', () => {
    const r = transformShipment(makeShipment({ items: [] }))
    expect(r.totalWeight).toBeUndefined()
  })
})
