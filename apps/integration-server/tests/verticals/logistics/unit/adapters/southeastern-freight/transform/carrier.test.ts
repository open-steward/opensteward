import { describe, it, expect } from 'vitest'
import { transformCarrier } from '../../../../../../../src/verticals/logistics/adapters/southeastern-freight/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

describe('southeastern-freight transformCarrier', () => {
  it('returns id southeastern-freight', () => {
    expect(transformCarrier().id).toBe('southeastern-freight')
  })

  it('returns code SEFL', () => {
    expect(transformCarrier().code).toBe('SEFL')
  })

  it('returns name Southeastern Freight Lines', () => {
    expect(transformCarrier().name).toBe('Southeastern Freight Lines')
  })

  it('returns isActive true', () => {
    expect(transformCarrier().isActive).toBe(true)
  })

  it('includes trackingUrlTemplate with {trackingNumber} placeholder', () => {
    const t = transformCarrier().trackingUrlTemplate
    expect(t).toBeDefined()
    expect(t).toContain('{trackingNumber}')
    expect(t).toContain('sefl.com')
  })

  it('includes at least one service', () => {
    const services = transformCarrier().services
    expect(services).toBeDefined()
    expect(services!.length).toBeGreaterThan(0)
    expect(services![0].code).toBe('SEFL_LTL')
  })

  it('produces schema-valid Carrier', () => {
    expect(() => CarrierSchema.parse(transformCarrier())).not.toThrow()
  })
})
