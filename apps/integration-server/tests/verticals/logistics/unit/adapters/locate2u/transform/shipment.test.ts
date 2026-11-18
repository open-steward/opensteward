import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type Locate2uShipment,
} from '../../../../../../../src/verticals/logistics/adapters/locate2u/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(o: Partial<Locate2uShipment> = {}): Locate2uShipment {
  return {
    shipmentId: 2002,
    status: 'intransit',
    shipmentRef: 'LOC-SHIP-001',
    contact: { name: 'Bob Jones', phone: '+15125550400', email: 'bob@example.com' },
    tripDate: '2024-03-01T00:00:00Z',
    lastModifiedDate: '2024-03-01T00:00:00Z',
    notes: 'Fragile',
    load: { weight: 15, length: 60, width: 40, height: 30 },
    pickupStop: {
      stopId: 1,
      address: '10 Pickup Lane',
      contact: { name: 'Depot' },
    },
    dropStop: {
      stopId: 2,
      address: '20 Dropoff Ave',
      contact: { name: 'Bob Jones' },
    },
    ...o,
  }
}

describe('locate2u transformShipment', () => {
  it('maps shipmentId to id as string', () => {
    expect(transformShipment(makeShipment()).id).toBe('2002')
  })

  it('maps intransit status to IN_TRANSIT', () => {
    expect(transformShipment(makeShipment({ status: 'intransit' })).status).toBe('IN_TRANSIT')
  })

  it('maps in_transit status to IN_TRANSIT', () => {
    expect(transformShipment(makeShipment({ status: 'in_transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps pending status to PENDING', () => {
    expect(transformShipment(makeShipment({ status: 'pending' })).status).toBe('PENDING')
  })

  it('maps assigned status to LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ status: 'assigned' })).status).toBe('LABEL_CREATED')
  })

  it('maps completed status to DELIVERED', () => {
    expect(transformShipment(makeShipment({ status: 'completed' })).status).toBe('DELIVERED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformShipment(makeShipment({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps failed status to EXCEPTION', () => {
    expect(transformShipment(makeShipment({ status: 'failed' })).status).toBe('EXCEPTION')
  })

  it('maps shipmentRef to reference', () => {
    expect(transformShipment(makeShipment()).reference).toBe('LOC-SHIP-001')
  })

  it('maps pickupStop address to originAddress', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.street1).toBe('10 Pickup Lane')
    expect(result.originAddress?.name).toBe('Depot')
  })

  it('maps dropStop address to destinationAddress', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.street1).toBe('20 Dropoff Ave')
  })

  it('maps load weight to totalWeight in kg', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(15)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps load dimensions in cm', () => {
    const result = transformShipment(makeShipment())
    expect(result.dimensions?.length).toBe(60)
    expect(result.dimensions?.width).toBe(40)
    expect(result.dimensions?.height).toBe(30)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps notes', () => {
    expect(transformShipment(makeShipment()).notes).toBe('Fragile')
  })

  it('maps tripDate to createdAt Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('prefers stop-level load over shipment-level load for weight', () => {
    const result = transformShipment(
      makeShipment({
        load: { weight: 5 },
        pickupStop: {
          address: '10 Pickup Lane',
          load: { weight: 25 },
        },
      }),
    )
    expect(result.totalWeight?.value).toBe(25)
  })

  it('attaches metadata', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('validates against ShipmentSchema', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
