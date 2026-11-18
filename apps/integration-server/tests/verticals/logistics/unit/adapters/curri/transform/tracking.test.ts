import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/curri/transform/tracking'
import type { CurriDelivery } from '../../../../../../../src/verticals/logistics/adapters/curri/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeDelivery(o: Partial<CurriDelivery> = {}): CurriDelivery {
  return {
    id: 'del-789',
    createdAt: '2024-03-01T00:00:00Z',
    deliveredAt: '2024-03-01T12:00:00Z',
    deliveryStatus: { code: 'delivered', name: 'Delivered' },
    destination: {
      name: 'Customer',
      addressLine1: '200 Oak Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
    },
    ...o,
  }
}

describe('curri transformTracking', () => {
  it('returns exactly one event', () => {
    const result = transformTracking(makeDelivery())
    expect(result).toHaveLength(1)
  })

  it('maps shipmentId to delivery id', () => {
    const result = transformTracking(makeDelivery())
    expect(result[0].shipmentId).toBe('del-789')
  })

  it('maps trackingNumber to delivery id', () => {
    const result = transformTracking(makeDelivery())
    expect(result[0].trackingNumber).toBe('del-789')
  })

  it('maps carrierId to curri', () => {
    const result = transformTracking(makeDelivery())
    expect(result[0].carrierId).toBe('curri')
  })

  it('maps delivered status to DELIVERED', () => {
    const result = transformTracking(makeDelivery())
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps pending status to PRE_TRANSIT', () => {
    const result = transformTracking(makeDelivery({ deliveryStatus: { code: 'pending' } }))
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps en_route_to_destination to IN_TRANSIT', () => {
    const result = transformTracking(
      makeDelivery({ deliveryStatus: { code: 'en_route_to_destination' } }),
    )
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps at_destination to OUT_FOR_DELIVERY', () => {
    const result = transformTracking(makeDelivery({ deliveryStatus: { code: 'at_destination' } }))
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps canceled to FAILURE', () => {
    const result = transformTracking(makeDelivery({ deliveryStatus: { code: 'canceled' } }))
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps description from deliveryStatus.name', () => {
    const result = transformTracking(makeDelivery())
    expect(result[0].description).toBe('Delivered')
  })

  it('maps occurredAt from deliveredAt', () => {
    const result = transformTracking(makeDelivery())
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to createdAt when deliveredAt is null', () => {
    const result = transformTracking(makeDelivery({ deliveredAt: null }))
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('maps destination location', () => {
    const result = transformTracking(makeDelivery())
    expect(result[0].location?.city).toBe('Austin')
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTracking(makeDelivery())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })
})
