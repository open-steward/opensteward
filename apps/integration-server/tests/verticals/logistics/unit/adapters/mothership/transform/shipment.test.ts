import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  unwrapShipment,
  type MothershipShipmentResponse,
  type MothershipShipmentDataWrapper,
} from '../../../../../../../src/verticals/logistics/adapters/mothership/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(
  overrides: Partial<MothershipShipmentResponse> = {},
): MothershipShipmentResponse {
  return {
    id: 'mship-100',
    createdAt: '2024-03-01T00:00:00Z',
    status: 'in_transit',
    price: 100.0,
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    trackingUrl: 'https://track.mothership.com/mship-100',
    pickup: {
      name: 'Shipper Co',
      street: '100 Origin Blvd',
      subStreet: 'Dock 3',
      city: 'Dallas',
      state: 'TX',
      zip: '75201',
      phoneNumber: '2145550001',
      emails: ['shipper@example.com'],
    },
    delivery: {
      name: 'Receiver Inc',
      street: '200 Dest Ave',
      city: 'Atlanta',
      state: 'GA',
      zip: '30301',
      phoneNumber: '4045550002',
      emails: ['receiver@example.com'],
    },
    freight: [
      {
        quantity: 2,
        type: 'pallet',
        weight: 500,
        length: 48,
        width: 40,
        height: 48,
        description: 'Machinery',
      },
    ],
    partner: { name: 'SAIA', pickupNumber: 'PU-777', proNumber: 'PRO-888' },
    ...overrides,
  }
}

describe('transformShipment (mothership)', () => {
  it('maps id', () => {
    expect(transformShipment(makeShipment()).id).toBe('mship-100')
  })

  it('maps status IN_TRANSIT for "in_transit"', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps status DELIVERED for "delivered"', () => {
    expect(transformShipment(makeShipment({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status CANCELLED for "cancelled"', () => {
    expect(transformShipment(makeShipment({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps trackingNumber from partner.proNumber', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('PRO-888')
  })

  it('falls back to pickupNumber when proNumber is absent', () => {
    const raw = makeShipment({ partner: { pickupNumber: 'PU-777', proNumber: undefined } })
    expect(transformShipment(raw).trackingNumber).toBe('PU-777')
  })

  it('maps carrierId to "mothership"', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('mothership')
  })

  it('maps serviceCode from partner.name', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('SAIA')
  })

  it('maps labelUrl from trackingUrl', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe(
      'https://track.mothership.com/mship-100',
    )
  })

  it('maps origin address from pickup', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Shipper Co')
    expect(result.originAddress?.street1).toBe('100 Origin Blvd')
    expect(result.originAddress?.city).toBe('Dallas')
    expect(result.originAddress?.postalCode).toBe('75201')
    expect(result.originAddress?.phone).toBe('2145550001')
  })

  it('maps destination address from delivery', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Receiver Inc')
    expect(result.destinationAddress?.city).toBe('Atlanta')
  })

  it('converts price (float USD) to cents integer in cost', () => {
    // 100.0 USD → 10000 cents
    expect(transformShipment(makeShipment()).cost?.amount).toBe(10000)
    expect(transformShipment(makeShipment()).cost?.currency).toBe('USD')
  })

  it('maps mode to "ltl"', () => {
    expect(transformShipment(makeShipment()).mode).toBe('ltl')
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces a ShipmentSchema-valid result', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})

describe('unwrapShipment (mothership)', () => {
  it('unwraps from data wrapper', () => {
    const raw = makeShipment()
    const wrapper: MothershipShipmentDataWrapper = { data: raw }
    expect(unwrapShipment(wrapper)).toBe(raw)
  })

  it('returns root when data is absent', () => {
    const raw = makeShipment()
    expect(unwrapShipment(raw)).toBe(raw)
  })
})
