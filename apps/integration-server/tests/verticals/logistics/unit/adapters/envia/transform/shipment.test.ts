/**
 * Fixtures follow the documented response schemas:
 * - GET /guide/{MM}/{YYYY} rows: tracking_number, carrier, status, created_at
 *   https://docs.envia.com/reference/shipments-by-month-year.md
 * - GET /guide/{tracking_number} `data`: adds origin, destination, updated_at
 *   https://docs.envia.com/reference/shipment-by-tracking.md
 * Status names come from the Track Shipments status catalog.
 */
import { describe, it, expect } from 'vitest'
import {
  mapShipmentStatus,
  transformShipment,
  type EnviaShipment,
} from '../../../../../../../src/verticals/logistics/adapters/envia/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

const monthRow: EnviaShipment = {
  tracking_number: '1234567890',
  carrier: 'fedex',
  status: 'Delivered',
  created_at: '2024-03-05T10:00:00Z',
}

const single: EnviaShipment = {
  ...monthRow,
  status: 'Shipped',
  origin: { city: 'Monterrey' },
  destination: { city: 'CDMX' },
  updated_at: '2024-03-07T08:30:00Z',
}

describe('transformShipment', () => {
  it('parses a month-list row with ShipmentSchema', () => {
    const s = ShipmentSchema.parse(transformShipment(monthRow))
    expect(s.id).toBe('1234567890')
    expect(s.trackingNumber).toBe('1234567890')
    expect(s.carrierId).toBe('fedex')
    expect(s.status).toBe('DELIVERED')
    expect(s.createdAt).toEqual(new Date('2024-03-05T10:00:00Z'))
    expect(s.updatedAt).toBeUndefined()
  })

  it('parses a single-shipment read with ShipmentSchema, keeping undocumented address objects in metadata only', () => {
    const s = ShipmentSchema.parse(transformShipment(single))
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.updatedAt).toEqual(new Date('2024-03-07T08:30:00Z'))
    expect(s.originAddress).toBeUndefined()
    expect(s.destinationAddress).toBeUndefined()
    expect(s.metadata).toEqual(single)
  })

  it('invents no cost, label URL or dates', () => {
    const s = transformShipment({ tracking_number: 'X1' })
    expect(s.cost).toBeUndefined()
    expect(s.labelUrl).toBeUndefined()
    expect(s.createdAt).toBeUndefined()
    expect(s.status).toBe('UNKNOWN')
  })
})

describe('mapShipmentStatus (Track Shipments status catalog)', () => {
  it.each([
    ['Created', 'LABEL_CREATED'],
    ['Pending', 'PENDING'],
    ['Shipped', 'IN_TRANSIT'],
    ['Picked Up', 'IN_TRANSIT'],
    ['Out for Delivery', 'OUT_FOR_DELIVERY'],
    ['Delivered', 'DELIVERED'],
    ['Canceled', 'CANCELLED'],
    ['Returned', 'RETURNED'],
    ['Delivered at Origin', 'RETURNED'],
    ['Lost', 'EXCEPTION'],
    ['Damaged', 'EXCEPTION'],
    ['Information', 'UNKNOWN'],
    ['something else', 'UNKNOWN'],
  ])('%s -> %s', (name, expected) => {
    expect(mapShipmentStatus(name)).toBe(expected)
  })
})
