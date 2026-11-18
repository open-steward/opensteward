import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type WebshipperShipment,
} from '../../../../../../../src/verticals/logistics/adapters/webshipper/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<WebshipperShipment> = {}): WebshipperShipment {
  return {
    id: 'ws-shp-001',
    type: 'shipments',
    attributes: {
      reference: 'REF-2024-001',
      service_code: 'express_parcel',
      status: 'in_transit',
      tracking_number: 'TRK-WS-001',
      tracking_links: [
        { url: 'https://track.webshipper.example/TRK-WS-001', number: 'TRK-WS-001' },
      ],
      packages: [
        {
          id: 'pkg-1',
          weight: '2.5',
          weight_unit: 'kg',
          length: 30,
          width: 20,
          height: 15,
          dimension_unit: 'cm',
          tracking_number: 'PKG-TRK-001',
        },
      ],
      delivery_address: {
        name: 'Bob Receiver',
        city: 'Berlin',
        postal_code: '10115',
        country: 'DE',
      },
      sender_address: {
        name: 'Alice Sender',
        city: 'Hamburg',
        postal_code: '20095',
        country: 'DE',
      },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-02T00:00:00Z',
    },
    ...overrides,
  }
}

describe('transformShipment (webshipper)', () => {
  it('maps id to string from raw.id', () => {
    expect(transformShipment(makeRaw()).id).toBe('ws-shp-001')
  })

  it('maps trackingNumber from attributes.tracking_number', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('TRK-WS-001')
  })

  it('falls back trackingNumber to first tracking_links.number when tracking_number absent', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, tracking_number: null } })
    expect(transformShipment(raw).trackingNumber).toBe('TRK-WS-001')
  })

  it('sets carrierId to webshipper', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('webshipper')
  })

  it('maps serviceCode from attributes.service_code', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('express_parcel')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeRaw()).status).toBe('IN_TRANSIT')
  })

  it('maps status created → LABEL_CREATED', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'created' } })
    expect(transformShipment(raw).status).toBe('LABEL_CREATED')
  })

  it('maps status out_for_delivery → OUT_FOR_DELIVERY', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'out_for_delivery' } })
    expect(transformShipment(raw).status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps status delivered → DELIVERED', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'delivered' } })
    expect(transformShipment(raw).status).toBe('DELIVERED')
  })

  it('maps status exception → EXCEPTION', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'exception' } })
    expect(transformShipment(raw).status).toBe('EXCEPTION')
  })

  it('maps status returned → RETURNED', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'returned' } })
    expect(transformShipment(raw).status).toBe('RETURNED')
  })

  it('maps status cancelled → CANCELLED', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'cancelled' } })
    expect(transformShipment(raw).status).toBe('CANCELLED')
  })

  it('maps unknown status → UNKNOWN', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'mystery' } })
    expect(transformShipment(raw).status).toBe('UNKNOWN')
  })

  it('maps originAddress from sender_address', () => {
    const result = transformShipment(makeRaw())
    expect(result.originAddress?.city).toBe('Hamburg')
    expect(result.originAddress?.country).toBe('DE')
  })

  it('maps destinationAddress from delivery_address', () => {
    const result = transformShipment(makeRaw())
    expect(result.destinationAddress?.city).toBe('Berlin')
    expect(result.destinationAddress?.postalCode).toBe('10115')
  })

  it('maps packages with id and trackingNumber', () => {
    const result = transformShipment(makeRaw())
    expect(result.packages).toHaveLength(1)
    expect(result.packages?.[0]?.id).toBe('pkg-1')
    expect(result.packages?.[0]?.trackingNumber).toBe('PKG-TRK-001')
  })

  it('maps totalWeight from first package weight', () => {
    const result = transformShipment(makeRaw())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps labelUrl from first tracking_links.url', () => {
    expect(transformShipment(makeRaw()).labelUrl).toContain('TRK-WS-001')
  })

  it('maps reference from attributes.reference', () => {
    expect(transformShipment(makeRaw()).reference).toBe('REF-2024-001')
  })

  it('maps createdAt from attributes.created_at', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from attributes.updated_at', () => {
    expect(transformShipment(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces output that parses against ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeRaw()))).not.toThrow()
  })
})
