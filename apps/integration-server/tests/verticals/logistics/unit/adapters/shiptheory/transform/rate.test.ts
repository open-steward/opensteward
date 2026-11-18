import { describe, it, expect } from 'vitest'
import {
  transformService,
  type ShiptheoryService,
} from '../../../../../../../src/verticals/logistics/adapters/shiptheory/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

describe('Shiptheory transformService', () => {
  const raw: ShiptheoryService = {
    id: 42,
    name: 'DPD_NEXT_DAY',
    carrier: 'dpd',
    carrier_name: 'DPD',
  }

  it('converts numeric id to string', () => {
    const result = transformService(raw)
    expect(result.id).toBe('42')
  })

  it('maps carrier to carrierId and name to serviceCode + serviceName', () => {
    const result = transformService(raw)
    expect(result.carrierId).toBe('dpd')
    expect(result.serviceCode).toBe('DPD_NEXT_DAY')
    expect(result.serviceName).toBe('DPD_NEXT_DAY')
  })

  it('passes RateSchema validation', () => {
    const result = transformService(raw)
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('produces undefined id when id is null', () => {
    const result = transformService({ ...raw, id: null })
    expect(result.id).toBeUndefined()
  })

  it('produces undefined carrierId when carrier is null', () => {
    const result = transformService({ ...raw, carrier: null })
    expect(result.carrierId).toBeUndefined()
  })

  it('produces undefined serviceCode when name is null', () => {
    const result = transformService({ ...raw, name: null })
    expect(result.serviceCode).toBeUndefined()
    expect(result.serviceName).toBeUndefined()
  })

  it('attaches raw as metadata', () => {
    const result = transformService(raw)
    expect(result.metadata).toBe(raw)
  })
})
