import { describe, it, expect } from 'vitest'
import {
  transformDelivery,
  type DelivereeDelivery,
} from '../../../../../../../src/verticals/logistics/adapters/deliveree/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeDelivery(overrides: Partial<DelivereeDelivery> = {}): DelivereeDelivery {
  return {
    id: 9001,
    status: 'delivery_in_progress',
    job_order_number: 'JOB-001',
    tracking_url: 'https://track.deliveree.com/9001',
    total_fees: 500,
    currency: 'THB',
    vehicle_type_id: 42,
    vehicle_type_info: { id: 42, name: 'Motorbike' },
    locations: [
      {
        address: '1 Origin St',
        recipient_name: 'Sender Name',
        recipient_phone: '+66811111111',
      },
      {
        address: '2 Dest Ave',
        recipient_name: 'Receiver Name',
        recipient_phone: '+66822222222',
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    pickup_time: '2024-03-01T08:00:00Z',
    completed_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('deliveree transformDelivery', () => {
  it('maps id to string', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.id).toBe('9001')
  })

  it('maps status delivery_in_progress to IN_TRANSIT', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps job_order_number to reference', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.reference).toBe('JOB-001')
  })

  it('sets carrierId to deliveree', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.carrierId).toBe('deliveree')
  })

  it('maps vehicle_type_info.name to serviceCode', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.serviceCode).toBe('Motorbike')
  })

  it('maps tracking_url to labelUrl', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.labelUrl).toBe('https://track.deliveree.com/9001')
  })

  it('maps cost with currency', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.cost?.amount).toBe(500)
    expect(result.cost?.currency).toBe('THB')
  })

  it('maps createdAt from created_at', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps actualDeliveryAt from completed_at', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps origin address from first location', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.originAddress?.name).toBe('Sender Name')
    expect(result.originAddress?.street1).toBe('1 Origin St')
  })

  it('maps destination address from last location', () => {
    const result = transformDelivery(makeDelivery())
    expect(result.destinationAddress?.name).toBe('Receiver Name')
  })

  it('passes schema validation', () => {
    const result = transformDelivery(makeDelivery())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('maps status canceled to CANCELLED', () => {
    const result = transformDelivery(makeDelivery({ status: 'canceled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status delivery_complete to DELIVERED', () => {
    const result = transformDelivery(makeDelivery({ status: 'delivery_complete' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('handles single location (origin = destination)', () => {
    const result = transformDelivery(
      makeDelivery({
        locations: [{ address: 'Only Stop', recipient_name: 'Solo' }],
      }),
    )
    expect(result.originAddress?.name).toBe('Solo')
    // destination === origin so it should be undefined
    expect(result.destinationAddress).toBeUndefined()
  })
})
