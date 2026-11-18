import { describe, it, expect } from 'vitest'
import {
  transformLoad,
  type TruckstopLoad,
} from '../../../../../../../src/verticals/logistics/adapters/truckstop/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeLoad(overrides: Partial<TruckstopLoad> = {}): TruckstopLoad {
  return {
    loadGuid: 'LG-001',
    loadNumber: 'LN-001',
    status: 'In Transit',
    loadStops: [
      {
        stopType: 'Pickup',
        locationName: 'Origin Dock',
        address1: '1 Origin Way',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        country: 'US',
      },
      {
        stopType: 'Delivery',
        locationName: 'Dest Dock',
        address1: '2 Dest Rd',
        city: 'Houston',
        state: 'TX',
        zip: '77001',
        country: 'US',
      },
    ],
    equipmentAttributes: {
      equipmentType: 'Van',
      weight: 42000,
    },
    rateAttributes: {
      amount: 2500,
      currency: 'USD',
    },
    note: 'Temp-controlled',
    postedDate: '2024-03-01T00:00:00Z',
    lastUpdatedDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('truckstop transformLoad', () => {
  it('maps id from loadGuid', () => {
    expect(transformLoad(makeLoad()).id).toBe('LG-001')
  })

  it('maps trackingNumber from loadNumber', () => {
    expect(transformLoad(makeLoad()).trackingNumber).toBe('LN-001')
  })

  it('maps status In Transit to IN_TRANSIT', () => {
    // LOAD_STATUS_SHIPMENT_MAP: 'In Transit' → 'IN_TRANSIT'
    expect(transformLoad(makeLoad()).status).toBe('IN_TRANSIT')
  })

  it('maps status Delivered to DELIVERED', () => {
    // LOAD_STATUS_SHIPMENT_MAP: 'Delivered' → 'DELIVERED'
    expect(transformLoad(makeLoad({ status: 'Delivered' })).status).toBe('DELIVERED')
  })

  it('maps status Cancelled to CANCELLED', () => {
    // LOAD_STATUS_SHIPMENT_MAP: 'Cancelled' → 'CANCELLED'
    expect(transformLoad(makeLoad({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('returns UNKNOWN for unknown status', () => {
    expect(transformLoad(makeLoad({ status: 'NOPE' })).status).toBe('UNKNOWN')
  })

  it('maps carrierId to truckstop', () => {
    expect(transformLoad(makeLoad()).carrierId).toBe('truckstop')
  })

  it('maps serviceCode from equipmentType', () => {
    expect(transformLoad(makeLoad()).serviceCode).toBe('Van')
  })

  it('maps origin address from first pickup stop', () => {
    const result = transformLoad(makeLoad())
    expect(result.originAddress?.city).toBe('Dallas')
    expect(result.originAddress?.state).toBe('TX')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destination address from last delivery stop', () => {
    const result = transformLoad(makeLoad())
    expect(result.destinationAddress?.city).toBe('Houston')
    expect(result.destinationAddress?.postalCode).toBe('77001')
  })

  it('maps totalWeight from equipmentAttributes.weight in lb', () => {
    const result = transformLoad(makeLoad())
    expect(result.totalWeight?.value).toBe(42000)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('maps cost amount in minor units', () => {
    // 2500 dollars → 250000 cents
    const result = transformLoad(makeLoad())
    expect(result.cost?.amount).toBe(250000)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps notes', () => {
    expect(transformLoad(makeLoad()).notes).toBe('Temp-controlled')
  })

  it('sets mode to ftl', () => {
    expect(transformLoad(makeLoad()).mode).toBe('ftl')
  })

  it('maps createdAt from postedDate as Date', () => {
    expect(transformLoad(makeLoad()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata through', () => {
    const raw = makeLoad()
    expect(transformLoad(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ShipmentSchema.parse(transformLoad(makeLoad()))).not.toThrow()
  })
})
