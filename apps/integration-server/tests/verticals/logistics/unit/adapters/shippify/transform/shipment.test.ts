import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type ShippifyTask,
} from '../../../../../../../src/verticals/logistics/adapters/shippify/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeTask(overrides: Partial<ShippifyTask> = {}): ShippifyTask {
  return {
    id: 'task-001',
    status: 3,
    _status: 'delivered',
    referenceId: 'ORD-2024-001',
    token: 'TRK-TOKEN-001',
    url: 'https://track.shippify.co/TRK-TOKEN-001',
    pickup: {
      location: {
        street1: '100 Origin St',
        city: 'Lima',
        country: 'PE',
      },
    },
    dropoff: {
      location: {
        street1: '200 Dest Ave',
        city: 'Bogota',
        country: 'CO',
      },
    },
    recipient: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+573001234567',
    },
    items: [{ weight: 2.5 }],
    price: 1500,
    currency: 'COP',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTask (shippify shipment)', () => {
  it('maps id, reference and labelUrl', () => {
    const result = transformTask(makeTask())
    expect(result.id).toBe('task-001')
    expect(result.reference).toBe('ORD-2024-001')
    expect(result.labelUrl).toBe('https://track.shippify.co/TRK-TOKEN-001')
  })

  it('uses token as trackingNumber', () => {
    expect(transformTask(makeTask()).trackingNumber).toBe('TRK-TOKEN-001')
  })

  it('prefers _status (human name) over numeric status for mapping', () => {
    // _status = 'delivered' → DELIVERED; numeric status 3 would also be DELIVERED
    expect(transformTask(makeTask({ _status: 'delivered', status: 0 })).status).toBe('DELIVERED')
  })

  it('maps all status codes', () => {
    const cases: [number | string | null | undefined, string][] = [
      [0, 'PENDING'],
      ['pending', 'PENDING'],
      ['created', 'PENDING'],
      ['new', 'PENDING'],
      [1, 'IN_TRANSIT'],
      ['assigned', 'IN_TRANSIT'],
      [2, 'IN_TRANSIT'],
      ['picked_up', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      [3, 'DELIVERED'],
      ['delivered', 'DELIVERED'],
      [4, 'CANCELLED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      [5, 'RETURNED'],
      ['failed', 'RETURNED'],
      ['returned', 'RETURNED'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformTask(makeTask({ _status: null, status: status ?? undefined })).status).toBe(
        expected,
      )
    }
  })

  it('unwraps nested pickup.location for origin address', () => {
    const result = transformTask(makeTask())
    expect(result.originAddress?.city).toBe('Lima')
  })

  it('merges recipient data into destination address', () => {
    const result = transformTask(makeTask())
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.city).toBe('Bogota')
  })

  it('maps weight from items[0].weight', () => {
    const result = transformTask(makeTask())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps cost with amount and currency', () => {
    const result = transformTask(makeTask())
    expect(result.cost?.amount).toBe(1500)
    expect(result.cost?.currency).toBe('COP')
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformTask(makeTask()))).not.toThrow()
  })

  it('handles flat pickup address (no nested .location)', () => {
    const result = transformTask(
      makeTask({ pickup: { street1: '10 Main', city: 'Quito', country: 'EC' } }),
    )
    expect(result.originAddress?.city).toBe('Quito')
  })

  it('cost is undefined when price is null', () => {
    expect(transformTask(makeTask({ price: null })).cost).toBeUndefined()
  })

  it('weight is undefined when items is empty', () => {
    expect(transformTask(makeTask({ items: [] })).totalWeight).toBeUndefined()
  })
})
