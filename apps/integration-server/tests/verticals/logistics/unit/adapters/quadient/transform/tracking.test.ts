import { describe, it, expect } from 'vitest'
import {
  transformPackage,
  type QuadientPackage,
} from '../../../../../../../src/verticals/logistics/adapters/quadient/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makePackage(overrides: Partial<QuadientPackage> = {}): QuadientPackage {
  return {
    packageId: 'pkg-001',
    trackingNumber: '1Z999AA10123456784',
    carrier: 'UPS',
    status: 'delivered',
    lockerName: 'Lobby Locker A1',
    lockerAddress: '100 Main St',
    lockerCity: 'San Francisco',
    lockerState: 'CA',
    lockerPostalCode: '94105',
    lockerCountry: 'US',
    recipientEmail: 'recipient@example.com',
    deliveredAt: '2024-03-01T00:00:00Z',
    pickedUpAt: null,
    returnedAt: null,
    expiresAt: '2024-03-08T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformPackage', () => {
  it('maps trackingNumber and carrier', () => {
    const result = transformPackage(makePackage())
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrierId).toBe('UPS')
  })

  it('falls back trackingNumber to packageId when trackingNumber is null', () => {
    const result = transformPackage(makePackage({ trackingNumber: null }))
    expect(result.trackingNumber).toBe('pkg-001')
  })

  it('maps status to canonical TrackingEventStatus', () => {
    const cases: [string, string][] = [
      ['pending', 'PRE_TRANSIT'],
      ['delivered', 'AVAILABLE_FOR_PICKUP'],
      ['picked_up', 'DELIVERED'],
      ['expired', 'RETURN_TO_SENDER'],
      ['returned', 'RETURN_TO_SENDER'],
      ['failed', 'FAILURE'],
      ['unknown_status', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformPackage(makePackage({ status })).status).toBe(expected)
    }
  })

  it('builds description from status and lockerName', () => {
    const result = transformPackage(makePackage({ status: 'delivered' }))
    expect(result.description).toBe('Delivered to locker: Lobby Locker A1')
  })

  it('maps locker address to location', () => {
    const result = transformPackage(makePackage())
    expect(result.location?.city).toBe('San Francisco')
    expect(result.location?.state).toBe('CA')
    expect(result.location?.country).toBe('US')
    expect(result.location?.postalCode).toBe('94105')
  })

  it('does not attach location when all locker geo fields are absent', () => {
    const result = transformPackage(
      makePackage({
        lockerCity: null,
        lockerState: null,
        lockerCountry: null,
        lockerPostalCode: null,
      }),
    )
    expect(result.location).toBeUndefined()
  })

  it('uses pickedUpAt as occurredAt when present', () => {
    const result = transformPackage(
      makePackage({ status: 'picked_up', pickedUpAt: '2024-03-05T00:00:00Z' }),
    )
    expect(result.occurredAt).toBeInstanceOf(Date)
    expect(result.occurredAt?.toISOString()).toBe('2024-03-05T00:00:00.000Z')
  })

  it('maps createdAt from createdAt field', () => {
    const result = transformPackage(makePackage())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes schema parse', () => {
    const result = transformPackage(makePackage())
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })

  it('passes schema parse for all statuses', () => {
    const statuses = ['pending', 'delivered', 'picked_up', 'expired', 'returned', 'failed']
    for (const status of statuses) {
      const result = transformPackage(makePackage({ status }))
      expect(() => TrackingEventSchema.parse(result)).not.toThrow()
    }
  })
})
