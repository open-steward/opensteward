import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  POCHTA_RUSSIA_CARRIER,
} from '../../../../../../../src/verticals/logistics/adapters/pochta-russia/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

describe('transformCarrier', () => {
  it('returns the static carrier record', () => {
    const result = transformCarrier()
    expect(result).toBe(POCHTA_RUSSIA_CARRIER)
  })

  it('has id=pochta-russia and isActive=true', () => {
    const result = transformCarrier()
    expect(result.id).toBe('pochta-russia')
    expect(result.isActive).toBe(true)
  })

  it('includes at least the known service codes', () => {
    const result = transformCarrier()
    const codes = result.services?.map((s) => s.code)
    expect(codes).toContain('47030')
    expect(codes).toContain('47920')
  })

  it('passes schema parse', () => {
    const result = transformCarrier()
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
