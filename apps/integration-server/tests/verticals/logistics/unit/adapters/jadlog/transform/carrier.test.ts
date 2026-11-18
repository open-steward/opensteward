import { describe, it, expect } from 'vitest'
import { transformCarrier } from '../../../../../../../src/verticals/logistics/adapters/jadlog/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

describe('jadlog transformCarrier', () => {
  it('returns carrier with id jadlog', () => {
    expect(transformCarrier().id).toBe('jadlog')
  })

  it('returns carrier with name Jadlog', () => {
    expect(transformCarrier().name).toBe('Jadlog')
  })

  it('returns isActive true', () => {
    expect(transformCarrier().isActive).toBe(true)
  })

  it('includes services array with at least one entry', () => {
    const services = transformCarrier().services ?? []
    expect(services.length).toBeGreaterThan(0)
  })

  it('includes COM service (code 0)', () => {
    const services = transformCarrier().services ?? []
    const com = services.find((s) => s.code === '0')
    expect(com).toBeDefined()
  })

  it('includes tracking URL template', () => {
    expect(transformCarrier().trackingUrlTemplate).toContain('{trackingNumber}')
  })

  it('passes schema validation', () => {
    expect(() => CarrierSchema.parse(transformCarrier())).not.toThrow()
  })
})
