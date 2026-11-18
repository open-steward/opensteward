import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ShipcloudShipment,
} from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<ShipcloudShipment> = {}): ShipcloudShipment {
  return {
    id: 'sc-shp-001',
    carrier_tracking_no: 'JD000300006123456789',
    label_url: 'https://api.shipcloud.io/v1/shipments/sc-shp-001/label',
    price: 599,
    carrier: 'dhl',
    service: 'standard',
    reference_number: 'REF-001',
    from: {
      first_name: 'Alice',
      last_name: 'Sender',
      street: 'Sender Str.',
      street_no: '1',
      city: 'Hamburg',
      zip_code: '20095',
      country: 'DE',
    },
    to: {
      first_name: 'Bob',
      last_name: 'Receiver',
      street: 'Empfänger Allee',
      street_no: '99',
      city: 'Frankfurt',
      zip_code: '60311',
      country: 'DE',
    },
    packages: [
      {
        id: 'pkg-001',
        weight: 2.5,
        length: 30,
        width: 20,
        height: 10,
        tracking_events: [
          {
            id: 'evt-001',
            timestamp: '2024-03-01T00:00:00Z',
            location: 'Hamburg Hub',
            status: 'picked_up',
            details: 'Package picked up by DHL',
          },
        ],
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (shipcloud)', () => {
  it('maps id from shipment id', () => {
    expect(transformShipment(makeShipment()).id).toBe('sc-shp-001')
  })

  it('derives status from latest tracking event', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('falls back to LABEL_CREATED when no tracking events but label_url present', () => {
    const raw = makeShipment({
      packages: [{ id: 'p', weight: 1, length: 10, width: 10, height: 10, tracking_events: [] }],
    })
    expect(transformShipment(raw).status).toBe('LABEL_CREATED')
  })

  it('maps trackingNumber from carrier_tracking_no', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('JD000300006123456789')
  })

  it('maps carrierId from carrier field', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('dhl')
  })

  it('maps serviceCode from service field', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('standard')
  })

  it('maps reference from reference_number', () => {
    expect(transformShipment(makeShipment()).reference).toBe('REF-001')
  })

  it('maps originAddress from from field', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('Hamburg')
  })

  it('maps destinationAddress from to field', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Frankfurt')
  })

  it('maps totalWeight from first package weight in kg', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps dimensions from first package in cm', () => {
    const result = transformShipment(makeShipment())
    expect(result.dimensions?.length).toBe(30)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps cost amount from price in EUR', () => {
    const result = transformShipment(makeShipment({ price: 599 }))
    expect(result.cost?.amount).toBe(599)
    expect(result.cost?.currency).toBe('EUR')
  })

  it('maps createdAt as Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('maps all tracking status codes correctly', () => {
    const cases: [string, string][] = [
      ['label_created', 'LABEL_CREATED'],
      ['picked_up', 'IN_TRANSIT'],
      ['transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['awaits_pickup_by_receiver', 'OUT_FOR_DELIVERY'],
      ['canceled', 'CANCELLED'],
      ['delayed', 'IN_TRANSIT'],
      ['exception', 'EXCEPTION'],
      ['not_delivered', 'EXCEPTION'],
      ['destroyed', 'EXCEPTION'],
      ['return_to_sender', 'RETURNED'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({
        packages: [
          {
            id: 'p',
            weight: 1,
            length: 10,
            width: 10,
            height: 10,
            tracking_events: [{ timestamp: '2024-03-01T00:00:00Z', status }],
          },
        ],
      })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
