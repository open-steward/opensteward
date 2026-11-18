import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type GeodisShipment,
} from '../../../../../src/verticals/logistics/adapters/geodis/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<GeodisShipment> = {}): GeodisShipment {
  return {
    id: 'shp-001',
    tracking_number: 'TRK-1',
    status: 'IN_TRANSIT',
    service_code: 'STD',
    weight: 2.5,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Sender',
      street1: '1 Origin St',
      city: 'Paris',
      postal_code: '75001',
      country: 'FR',
    },
    recipient: {
      name: 'Bob Recipient',
      street1: '2 Dest Ave',
      city: 'Lyon',
      postal_code: '69001',
      country: 'FR',
    },
    label_url: 'https://example.com/label.pdf',
    reference: 'REF-001',
    created_at: '2024-05-10T09:00:00Z',
    updated_at: '2024-05-10T10:30:00Z',
    ...overrides,
  }
}

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Geodis transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('shp-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('TRK-1')
    expect(result.carrierId).toBe('geodis')
    expect(result.serviceCode).toBe('STD')
    expect(result.reference).toBe('REF-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('Paris')
    expect(result.destinationAddress?.name).toBe('Bob Recipient')
    expect(result.destinationAddress?.city).toBe('Lyon')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformShipment(
      makeShipment({
        weight: null,
        weight_unit: null,
        label_url: null,
        sender: null,
        recipient: null,
        service_code: null,
        status: null,
        reference: null,
        created_at: null,
        updated_at: null,
      }),
    )
    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['CREATED', 'LABEL_CREATED'],
      ['LABEL_CREATED', 'LABEL_CREATED'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
