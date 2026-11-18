import { describe, it, expect } from 'vitest'
import {
  transformDeliveryPoint,
  type CdekDeliveryPoint,
} from '../../../../../../../src/verticals/logistics/adapters/cdek/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeRaw(overrides: Partial<CdekDeliveryPoint> = {}): CdekDeliveryPoint {
  return {
    code: 'MSK1',
    name: 'CDEK Moscow Central',
    type: 'PVZ',
    phones: [{ number: '+74951234567' }],
    email: 'msk1@cdek.ru',
    work_time: 'Mon-Sat 09:00-20:00',
    work_time_list: [
      { day: 1, time: '09:00/20:00' },
      { day: 2, time: '09:00/20:00' },
    ],
    location: {
      country_code: 'RU',
      region: 'Moscow',
      city: 'Moscow',
      address: 'Arbat Street 10',
      postal_code: '119002',
    },
    is_reception: true,
    is_handout: true,
    ...overrides,
  }
}

describe('cdek transformDeliveryPoint', () => {
  it('maps code to id and code', () => {
    const result = transformDeliveryPoint(makeRaw())
    expect(result.id).toBe('MSK1')
    expect(result.code).toBe('MSK1')
  })

  it('maps name to name', () => {
    expect(transformDeliveryPoint(makeRaw()).name).toBe('CDEK Moscow Central')
  })

  it('maps location.address to address.street1', () => {
    expect(transformDeliveryPoint(makeRaw()).address?.street1).toBe('Arbat Street 10')
  })

  it('maps location.city to address.city', () => {
    expect(transformDeliveryPoint(makeRaw()).address?.city).toBe('Moscow')
  })

  it('maps location.region to address.state', () => {
    expect(transformDeliveryPoint(makeRaw()).address?.state).toBe('Moscow')
  })

  it('maps location.postal_code to address.postalCode', () => {
    expect(transformDeliveryPoint(makeRaw()).address?.postalCode).toBe('119002')
  })

  it('maps location.country_code to address.country', () => {
    expect(transformDeliveryPoint(makeRaw()).address?.country).toBe('RU')
  })

  it('maps first phone number to address.phone', () => {
    expect(transformDeliveryPoint(makeRaw()).address?.phone).toBe('+74951234567')
  })

  it('extracts closing time from work_time_list as cutoffTime', () => {
    // work_time_list[0].time is "09:00/20:00"; closing side is "20:00"
    expect(transformDeliveryPoint(makeRaw()).cutoffTime).toBe('20:00')
  })

  it('hardcodes isActive to true', () => {
    expect(transformDeliveryPoint(makeRaw()).isActive).toBe(true)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformDeliveryPoint(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies WarehouseSchema', () => {
    const result = transformDeliveryPoint(makeRaw())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })

  it('returns undefined address when location is absent', () => {
    expect(transformDeliveryPoint(makeRaw({ location: null })).address).toBeUndefined()
  })

  it('returns undefined cutoffTime when work_time_list is absent', () => {
    expect(transformDeliveryPoint(makeRaw({ work_time_list: null })).cutoffTime).toBeUndefined()
  })
})
