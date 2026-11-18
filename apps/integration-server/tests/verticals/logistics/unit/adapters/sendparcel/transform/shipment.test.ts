import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type SendParcelShipment,
} from '../../../../../../../src/verticals/logistics/adapters/sendparcel/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<SendParcelShipment> = {}): SendParcelShipment {
  return {
    id: 'shp-001',
    reference: 'REF-001',
    status: 'in_transit',
    trackingNumber: 'TN987654321',
    carrier: 'dhl',
    service: '38',
    warehouseId: 'wh-001',
    senderAddress: {
      name: 'Sender',
      street: '1 Origin Rd',
      city: 'Vilnius',
      countryCode: 'LT',
    },
    receiverAddress: {
      name: 'Receiver',
      street: '5 Dest St',
      city: 'Warsaw',
      countryCode: 'PL',
    },
    returnAddress: null,
    parcel: { weight: 2.5, length: 40, width: 30, height: 20 },
    labelUrl: 'https://labels.sendparcel.com/shp-001.pdf',
    price: 1250,
    currency: 'EUR',
    notes: 'Handle with care',
    estimatedDelivery: '2024-03-05T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ─── transformShipment ────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps id, trackingNumber, carrierId, serviceCode', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)
    expect(result.id).toBe('shp-001')
    expect(result.trackingNumber).toBe('TN987654321')
    expect(result.carrierId).toBe('dhl')
    expect(result.serviceCode).toBe('38')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment({ status: 'in_transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps all status values', () => {
    const cases: [string, string][] = [
      ['created', 'LABEL_CREATED'],
      ['label_created', 'LABEL_CREATED'],
      ['transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['exception', 'EXCEPTION'],
      ['error', 'EXCEPTION'],
      ['returned', 'RETURNED'],
      ['return_to_sender', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['foobar', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })

  it('maps parcel weight → totalWeight in kg', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps parcel dims → dimensions in cm', () => {
    const result = transformShipment(makeShipment())
    expect(result.dimensions?.length).toBe(40)
    expect(result.dimensions?.width).toBe(30)
    expect(result.dimensions?.height).toBe(20)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps price → cost.amount and currency', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(1250)
    expect(result.cost?.currency).toBe('EUR')
  })

  it('maps reference, notes, labelUrl', () => {
    const result = transformShipment(makeShipment())
    expect(result.reference).toBe('REF-001')
    expect(result.notes).toBe('Handle with care')
    expect(result.labelUrl).toBe('https://labels.sendparcel.com/shp-001.pdf')
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Sender')
    expect(result.originAddress?.country).toBe('LT')
    expect(result.destinationAddress?.name).toBe('Receiver')
    expect(result.destinationAddress?.country).toBe('PL')
  })

  it('parses estimatedDelivery, createdAt, updatedAt as Dates', () => {
    const result = transformShipment(makeShipment())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('omits totalWeight and dimensions when parcel is null', () => {
    const result = transformShipment(makeShipment({ parcel: null }))
    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
  })

  it('omits cost when price is null', () => {
    const result = transformShipment(makeShipment({ price: null }))
    expect(result.cost).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })

  it('passes metadata as raw object reference', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
