import { describe, it, expect } from 'vitest'
import {
  transformOrigin,
  type ShipiumOrigin,
} from '../../../../../../../src/verticals/logistics/adapters/shipium/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeRaw(overrides: Partial<ShipiumOrigin> = {}): ShipiumOrigin {
  return {
    originId: 'origin-001',
    partnerProvidedId: 'WH-SFO1',
    name: 'SF Warehouse',
    description: 'Main west coast warehouse',
    originType: 'warehouse',
    address: {
      name: 'Warehouse',
      street1: '1 Industrial Ave',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94114',
      countryCode: 'US',
    },
    scheduleConfigured: true,
    activeSchedule: {
      from: '2024-01-01',
      to: '2024-12-31',
      shippingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      processingCutoff: {
        shippingCutoffHour: 17,
        weekendCutoffHour: 12,
        expectedDaysToShip: 1,
      },
    },
    orchestratedAssetMetadata: {
      orchestrationId: 'orch-001',
      orchestrationTimeStamp: '2024-03-01T00:00:00Z',
    },
    ...overrides,
  }
}

describe('transformOrigin', () => {
  it('maps id from originId', () => {
    expect(transformOrigin(makeRaw()).id).toBe('origin-001')
  })

  it('maps name', () => {
    expect(transformOrigin(makeRaw()).name).toBe('SF Warehouse')
  })

  it('maps code from partnerProvidedId', () => {
    expect(transformOrigin(makeRaw()).code).toBe('WH-SFO1')
  })

  it('maps isActive from scheduleConfigured', () => {
    expect(transformOrigin(makeRaw()).isActive).toBe(true)
    expect(transformOrigin(makeRaw({ scheduleConfigured: false })).isActive).toBe(false)
  })

  it('maps cutoffTime from shippingCutoffHour as HH:MM', () => {
    expect(transformOrigin(makeRaw()).cutoffTime).toBe('17:00')
  })

  it('zero-pads single-digit cutoff hours', () => {
    const raw = makeRaw()
    raw.activeSchedule!.processingCutoff!.shippingCutoffHour = 9
    expect(transformOrigin(raw).cutoffTime).toBe('09:00')
  })

  it('maps address city from nested address', () => {
    expect(transformOrigin(makeRaw()).address?.city).toBe('San Francisco')
  })

  it('maps address country from countryCode', () => {
    expect(transformOrigin(makeRaw()).address?.country).toBe('US')
  })

  it('maps createdAt from orchestrationTimeStamp', () => {
    expect(transformOrigin(makeRaw()).createdAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('passes schema validation', () => {
    const result = transformOrigin(makeRaw())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformOrigin(raw).metadata).toBe(raw)
  })

  it('handles missing activeSchedule gracefully', () => {
    const result = transformOrigin(makeRaw({ activeSchedule: undefined }))
    expect(result.cutoffTime).toBeUndefined()
  })
})
