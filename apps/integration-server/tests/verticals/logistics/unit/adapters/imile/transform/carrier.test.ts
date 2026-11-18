import { describe, it, expect } from 'vitest'
import { getIMileCarrier } from '../../../../../../../src/verticals/logistics/adapters/imile/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

describe('imile getIMileCarrier', () => {
  it('returns id of imile', () => {
    expect(getIMileCarrier().id).toBe('imile')
  })

  it('returns code of imile', () => {
    expect(getIMileCarrier().code).toBe('imile')
  })

  it('returns name iMile Express', () => {
    expect(getIMileCarrier().name).toBe('iMile Express')
  })

  it('is active', () => {
    expect(getIMileCarrier().isActive).toBe(true)
  })

  it('includes a non-empty services array', () => {
    const services = getIMileCarrier().services ?? []
    expect(services.length).toBeGreaterThan(0)
  })

  it('includes trackingUrlTemplate', () => {
    expect(getIMileCarrier().trackingUrlTemplate).toContain('imile.com')
  })

  it('passes CarrierSchema.parse without throwing', () => {
    expect(() => CarrierSchema.parse(getIMileCarrier())).not.toThrow()
  })
})
