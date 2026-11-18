import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type QuiqupDeliveryJob,
} from '../../../../../../../src/verticals/logistics/adapters/quiqup/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<QuiqupDeliveryJob> = {}): QuiqupDeliveryJob {
  return {
    id: 'job-qq-001',
    reference: 'REF-JOB-001',
    status: 'in_transit',
    tracking_number: 'QQ123456789',
    tracking_url: 'https://track.quiqup.example/QQ123456789',
    service_type: 'SAME_DAY',
    pickup_address: {
      name: 'Sender',
      address_line_1: '1 Pickup Ln',
      city: 'Dubai',
      country_code: 'AE',
    },
    delivery_address: {
      name: 'Recipient',
      address_line_1: '2 Drop St',
      city: 'Sharjah',
      country_code: 'AE',
    },
    weight_grams: 500,
    price: { amount: 25.0, currency: 'AED' },
    estimated_delivery_at: '2024-03-01T18:00:00Z',
    actual_delivery_at: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T08:00:00Z',
    label_url: 'https://labels.quiqup.example/job-qq-001.pdf',
    notes: 'Ring bell',
    ...overrides,
  }
}

// ─── transformShipment ────────────────────────────────────────────────────────

describe('Quiqup transformShipment', () => {
  it('maps id, carrierId, trackingNumber', () => {
    const result = transformShipment(makeRaw())
    expect(result.id).toBe('job-qq-001')
    expect(result.carrierId).toBe('quiqup')
    expect(result.trackingNumber).toBe('QQ123456789')
  })

  it('maps in_transit to IN_TRANSIT', () => {
    expect(transformShipment(makeRaw({ status: 'in_transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps weight_grams to totalWeight in grams', () => {
    const result = transformShipment(makeRaw())
    expect(result.totalWeight?.value).toBe(500)
    expect(result.totalWeight?.unit).toBe('g')
  })

  it('maps price to cost with amount and currency', () => {
    const result = transformShipment(makeRaw())
    expect(result.cost?.amount).toBe(25.0)
    expect(result.cost?.currency).toBe('AED')
  })

  it('maps pickup_address and delivery_address', () => {
    const result = transformShipment(makeRaw())
    expect(result.originAddress?.city).toBe('Dubai')
    expect(result.destinationAddress?.city).toBe('Sharjah')
  })

  it('maps label_url and notes', () => {
    const result = transformShipment(makeRaw())
    expect(result.labelUrl).toBe('https://labels.quiqup.example/job-qq-001.pdf')
    expect(result.notes).toBe('Ring bell')
  })

  it('maps all status codes correctly', () => {
    const cases: [string, string][] = [
      ['pending', 'PENDING'],
      ['created', 'PENDING'],
      ['accepted', 'LABEL_CREATED'],
      ['assigned', 'LABEL_CREATED'],
      ['label_created', 'LABEL_CREATED'],
      ['collected', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['at_hub', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['with_courier', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['completed', 'DELIVERED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['returned', 'RETURNED'],
      ['return_to_sender', 'RETURNED'],
      ['failed', 'EXCEPTION'],
      ['exception', 'EXCEPTION'],
      ['delivery_failed', 'EXCEPTION'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeRaw({ status })).status).toBe(expected)
    }
  })

  it('handles missing weight gracefully', () => {
    const result = transformShipment(makeRaw({ weight_grams: null }))
    expect(result.totalWeight).toBeUndefined()
  })

  it('defaults cost currency to GBP when missing', () => {
    const result = transformShipment(makeRaw({ price: { amount: 10, currency: null } }))
    expect(result.cost?.currency).toBe('GBP')
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
