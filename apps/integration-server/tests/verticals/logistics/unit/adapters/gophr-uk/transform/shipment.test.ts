import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type GophrUkJob,
} from '../../../../../../../src/verticals/logistics/adapters/gophr-uk/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeJob(overrides: Partial<GophrUkJob> = {}): GophrUkJob {
  return {
    job_id: 'job-001',
    status: 'collected',
    pickup_address: {
      name: 'Sender Name',
      street1: '10 Pickup Lane',
      city: 'London',
      country: 'GB',
    },
    delivery_address: {
      name: 'Receiver Name',
      street1: '20 Delivery Road',
      city: 'Manchester',
      country: 'GB',
    },
    external_id: 'EXT-001',
    tracking_link: 'https://app.gophr.com/track/job-001',
    price_net: 600,
    price_gross: 720,
    currency: 'GBP',
    created_time: '2024-03-01T09:00:00Z',
    updated_time: '2024-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('Gophr UK transformShipment', () => {
  it('maps id from job_id', () => {
    expect(transformShipment(makeJob()).id).toBe('job-001')
  })

  it('maps trackingNumber from job_id', () => {
    expect(transformShipment(makeJob()).trackingNumber).toBe('job-001')
  })

  it('sets carrierId to gophr-uk', () => {
    expect(transformShipment(makeJob()).carrierId).toBe('gophr-uk')
  })

  it('maps collected → IN_TRANSIT status', () => {
    expect(transformShipment(makeJob({ status: 'collected' })).status).toBe('IN_TRANSIT')
  })

  it('maps new → PENDING status', () => {
    expect(transformShipment(makeJob({ status: 'new' })).status).toBe('PENDING')
  })

  it('maps created → LABEL_CREATED status', () => {
    expect(transformShipment(makeJob({ status: 'created' })).status).toBe('LABEL_CREATED')
  })

  it('maps confirmed → LABEL_CREATED status', () => {
    expect(transformShipment(makeJob({ status: 'confirmed' })).status).toBe('LABEL_CREATED')
  })

  it('maps accepted → IN_TRANSIT status', () => {
    expect(transformShipment(makeJob({ status: 'accepted' })).status).toBe('IN_TRANSIT')
  })

  it('maps at_pickup → IN_TRANSIT status', () => {
    expect(transformShipment(makeJob({ status: 'at_pickup' })).status).toBe('IN_TRANSIT')
  })

  it('maps en_route → IN_TRANSIT status', () => {
    expect(transformShipment(makeJob({ status: 'en_route' })).status).toBe('IN_TRANSIT')
  })

  it('maps out_for_delivery → OUT_FOR_DELIVERY status', () => {
    expect(transformShipment(makeJob({ status: 'out_for_delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps delivered → DELIVERED status', () => {
    expect(transformShipment(makeJob({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps returned → RETURNED status', () => {
    expect(transformShipment(makeJob({ status: 'returned' })).status).toBe('RETURNED')
  })

  it('maps cancelled → CANCELLED status', () => {
    expect(transformShipment(makeJob({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps failed → EXCEPTION status', () => {
    expect(transformShipment(makeJob({ status: 'failed' })).status).toBe('EXCEPTION')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeJob({ status: 'mystery' })).status).toBe('UNKNOWN')
  })

  it('maps labelUrl from tracking_link', () => {
    expect(transformShipment(makeJob()).labelUrl).toBe('https://app.gophr.com/track/job-001')
  })

  it('maps reference from external_id', () => {
    expect(transformShipment(makeJob()).reference).toBe('EXT-001')
  })

  it('maps cost.amount from price_gross', () => {
    expect(transformShipment(makeJob()).cost?.amount).toBe(720)
  })

  it('falls back to price_net when price_gross is null', () => {
    expect(transformShipment(makeJob({ price_gross: null })).cost?.amount).toBe(600)
  })

  it('maps cost.currency', () => {
    expect(transformShipment(makeJob()).cost?.currency).toBe('GBP')
  })

  it('defaults cost.currency to GBP when missing', () => {
    expect(transformShipment(makeJob({ currency: null })).cost?.currency).toBe('GBP')
  })

  it('omits cost when both price_gross and price_net are null', () => {
    const result = transformShipment(makeJob({ price_gross: null, price_net: null }))
    expect(result.cost).toBeUndefined()
  })

  it('maps createdAt from created_time', () => {
    expect(transformShipment(makeJob()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from updated_time', () => {
    expect(transformShipment(makeJob()).updatedAt).toBeInstanceOf(Date)
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeJob()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformShipment({})
    expect(result.id).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
    expect(result.cost).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('produces output that parses against ShipmentSchema', () => {
    const result = transformShipment(makeJob())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
