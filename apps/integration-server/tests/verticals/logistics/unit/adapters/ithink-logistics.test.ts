import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type IthinkLogisticsShipmentRaw,
} from '../../../../../src/verticals/logistics/adapters/ithink-logistics/transform/shipment'

function makeShipment(
  overrides: Partial<IthinkLogisticsShipmentRaw> = {},
): IthinkLogisticsShipmentRaw {
  return {
    id: 'shp-001',
    tracking_number: 'TRK123',
    status: 'IN_TRANSIT',
    service_code: 'STANDARD',
    weight: 2.5,
    weight_unit: 'kg',
    sender: { name: 'Alice', street1: '1 A St', city: 'A City', postal_code: '11111', country: 'US' },
    recipient: { name: 'Bob', street1: '2 B St', city: 'B City', postal_code: '22222', country: 'GB' },
    label_url: 'https://example.com/label.pdf',
    reference: 'REF-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('IthinkLogisticsAdapter transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('shp-001')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.trackingNumber).toBe('TRK123')
    expect(r.carrierId).toBe('ithink-logistics')
    expect(r.serviceCode).toBe('STANDARD')
    expect(r.reference).toBe('REF-001')
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.name).toBe('Alice')
    expect(r.destinationAddress?.name).toBe('Bob')
  })

  it('maps weight', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(2.5)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const r = transformShipment(makeShipment({
      weight: null, weight_unit: null, label_url: null, sender: null, recipient: null,
      service_code: null, status: null, reference: null, created_at: null, updated_at: null,
    }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.labelUrl).toBeUndefined()
    expect(r.originAddress).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
  })

  it('maps statuses correctly', () => {
    const cases: Array<[string | null, string]> = [
      ['DELIVERED', 'DELIVERED'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['CANCELLED', 'CANCELLED'],
      ['RETURNED', 'RETURNED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['CREATED', 'LABEL_CREATED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [s, expected] of cases) {
      expect(transformShipment(makeShipment({ status: s })).status).toBe(expected)
    }
  })
})
