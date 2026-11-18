import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type VenipakShipment,
  type VenipakPack,
} from '../../../../../../../src/verticals/logistics/adapters/venipak/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makePack(overrides: Partial<VenipakPack> = {}): VenipakPack {
  return {
    pack_no: 'VP001',
    weight: '2.5',
    quantity: '1',
    type: 'P',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<VenipakShipment> = {}): VenipakShipment {
  return {
    id: 'SHIP-001',
    reference: 'REF-2024-001',
    status: '1',
    tracking_no: null,
    label_url: 'https://api.venipak.com/labels/SHIP-001.pdf',
    consignor: null,
    sender: {
      name: 'UAB Sender',
      address: 'Sender St. 1',
      city: 'Vilnius',
      postcode: 'LT-01001',
      country: 'LT',
      phone: '+37061000000',
    },
    consignee: {
      name: 'Jonas Recipient',
      address: 'Recipient Rd. 5',
      city: 'Kaunas',
      postcode: 'LT-44001',
      country: 'LT',
      phone: '+37062000000',
      email: 'jonas@example.lt',
    },
    return_consignee: null,
    pack: makePack(),
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (venipak)', () => {
  it('maps id from id field', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('SHIP-001')
  })

  it('falls back id to reference when id is absent', () => {
    const result = transformShipment(makeShipment({ id: null }))
    expect(result.id).toBe('REF-2024-001')
  })

  it('hardcodes carrierId to venipak', () => {
    const result = transformShipment(makeShipment())
    expect(result.carrierId).toBe('venipak')
  })

  it('maps status "1" to IN_TRANSIT', () => {
    const result = transformShipment(makeShipment({ status: '1' }))
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps status "0" to LABEL_CREATED', () => {
    const result = transformShipment(makeShipment({ status: '0' }))
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('maps status "3" to DELIVERED', () => {
    const result = transformShipment(makeShipment({ status: '3' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps status "4" to RETURNED', () => {
    const result = transformShipment(makeShipment({ status: '4' }))
    expect(result.status).toBe('RETURNED')
  })

  it('maps status "6" to CANCELLED', () => {
    const result = transformShipment(makeShipment({ status: '6' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('extracts trackingNumber from pack.pack_no when tracking_no is null', () => {
    const result = transformShipment(makeShipment({ tracking_no: null }))
    expect(result.trackingNumber).toBe('VP001')
  })

  it('prefers tracking_no over pack.pack_no', () => {
    const result = transformShipment(makeShipment({ tracking_no: 'DIRECT-TRK' }))
    expect(result.trackingNumber).toBe('DIRECT-TRK')
  })

  it('aggregates weight from single pack', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('aggregates weight across multiple packs', () => {
    const packs = [makePack({ weight: '1.0' }), makePack({ weight: '1.5' })]
    const result = transformShipment(makeShipment({ pack: packs }))
    expect(result.totalWeight?.value).toBe(2.5)
  })

  it('maps originAddress from sender', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('UAB Sender')
    expect(result.originAddress?.city).toBe('Vilnius')
  })

  it('maps destinationAddress from consignee', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Jonas Recipient')
    expect(result.destinationAddress?.city).toBe('Kaunas')
  })

  it('maps labelUrl from label_url', () => {
    const result = transformShipment(makeShipment())
    expect(result.labelUrl).toBe('https://api.venipak.com/labels/SHIP-001.pdf')
  })

  it('maps reference field', () => {
    const result = transformShipment(makeShipment())
    expect(result.reference).toBe('REF-2024-001')
  })

  it('passes metadata through as raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
