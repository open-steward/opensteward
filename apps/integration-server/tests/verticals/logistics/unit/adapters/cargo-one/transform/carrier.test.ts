import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type CargoOneCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/cargo-one/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<CargoOneCarrier> = {}): CargoOneCarrier {
  return {
    id: 'LH',
    code: 'LH',
    iata_code: 'LH',
    name: 'Lufthansa Cargo',
    tracking_url_template: 'https://lufthansacargo.com/track/{trackingNumber}',
    services: [
      { code: 'LH_EXPRESS', name: 'Lufthansa Express', transitDaysMin: 1, transitDaysMax: 3 },
      { code: 'LH_ECONOMY', name: 'Lufthansa Economy', transitDaysMin: 3, transitDaysMax: 7 },
    ],
    is_active: true,
    active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformCarrier (cargo-one)', () => {
  it('maps id from id field', () => {
    expect(transformCarrier(makeCarrier()).id).toBe('LH')
  })

  it('maps name', () => {
    expect(transformCarrier(makeCarrier()).name).toBe('Lufthansa Cargo')
  })

  it('maps code from iata_code', () => {
    expect(transformCarrier(makeCarrier()).code).toBe('LH')
  })

  it('maps trackingUrlTemplate', () => {
    expect(transformCarrier(makeCarrier()).trackingUrlTemplate).toContain('{trackingNumber}')
  })

  it('maps isActive from is_active', () => {
    expect(transformCarrier(makeCarrier()).isActive).toBe(true)
  })

  it('maps isActive from active when is_active is null', () => {
    expect(transformCarrier(makeCarrier({ is_active: null })).isActive).toBe(true)
  })

  it('maps services array', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.services).toHaveLength(2)
    expect(result.services![0].code).toBe('LH_EXPRESS')
    expect(result.services![0].name).toBe('Lufthansa Express')
    expect(result.services![0].transitDaysMin).toBe(1)
    expect(result.services![0].transitDaysMax).toBe(3)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('omits services when services array is empty', () => {
    const result = transformCarrier(makeCarrier({ services: [] }))
    expect(result.services).toBeUndefined()
  })

  it('falls back id to iata_code then code when id is null', () => {
    const result = transformCarrier(makeCarrier({ id: null }))
    expect(result.id).toBe('LH') // from iata_code
  })

  it('passes metadata as original raw object', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('produces output that parses against CarrierSchema', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeCarrier()))).not.toThrow()
  })
})
