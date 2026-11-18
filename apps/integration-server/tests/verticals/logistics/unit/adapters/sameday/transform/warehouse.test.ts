import { describe, it, expect } from 'vitest'
import {
  transformPickupPoint,
  type SamedayPickupPoint,
} from '../../../../../../../src/verticals/logistics/adapters/sameday/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makePickupPoint(overrides: Partial<SamedayPickupPoint> = {}): SamedayPickupPoint {
  return {
    id: 42,
    country: { id: 1, name: 'Romania', code: 'RO' },
    county: { id: 10, name: 'Ilfov', code: 'IF' },
    city: {
      id: 100,
      name: 'Bucharest',
      samedayDeliveryAgency: 'SD-BUC',
      samedayPickupAgency: 'PU-BUC',
      extraKM: 0,
    },
    address: 'Str. Mihai Eminescu 10',
    defaultPickupPoint: true,
    pickupPointContactPerson: [
      { id: 1, name: 'Ion Popescu', phoneNumber: '+40711000000', defaultContactPerson: true },
    ],
    alias: 'Depot Bucharest',
    ...overrides,
  }
}

describe('sameday transformPickupPoint', () => {
  it('maps id to string from numeric id', () => {
    expect(transformPickupPoint(makePickupPoint()).id).toBe('42')
  })

  it('maps code to string from numeric id', () => {
    expect(transformPickupPoint(makePickupPoint()).code).toBe('42')
  })

  it('prefers alias for name', () => {
    expect(transformPickupPoint(makePickupPoint()).name).toBe('Depot Bucharest')
  })

  it('falls back to city name when no alias', () => {
    const r = transformPickupPoint(makePickupPoint({ alias: '' }))
    // `raw.alias ?? raw.city?.name` — an empty-string alias passes through ??, so use
    // null to exercise the city fallback.
    expect(transformPickupPoint(makePickupPoint({ alias: null as unknown as string })).name).toBe(
      'Bucharest',
    )
  })

  it('maps address street1 from address field', () => {
    expect(transformPickupPoint(makePickupPoint()).address?.street1).toBe('Str. Mihai Eminescu 10')
  })

  it('maps address city from city.name', () => {
    expect(transformPickupPoint(makePickupPoint()).address?.city).toBe('Bucharest')
  })

  it('maps address state from county.name', () => {
    expect(transformPickupPoint(makePickupPoint()).address?.state).toBe('Ilfov')
  })

  it('maps address country from country.code', () => {
    expect(transformPickupPoint(makePickupPoint()).address?.country).toBe('RO')
  })

  it('sets isActive to true', () => {
    expect(transformPickupPoint(makePickupPoint()).isActive).toBe(true)
  })

  it('preserves raw metadata', () => {
    const raw = makePickupPoint()
    expect(transformPickupPoint(raw).metadata).toBe(raw)
  })

  it('passes WarehouseSchema validation', () => {
    const result = transformPickupPoint(makePickupPoint())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })
})
