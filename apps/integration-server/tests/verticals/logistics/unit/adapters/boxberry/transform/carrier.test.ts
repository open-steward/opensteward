import { describe, it, expect } from 'vitest'
import { transformSelfCarrier } from '../../../../../../../src/verticals/logistics/adapters/boxberry/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

describe('transformSelfCarrier (boxberry)', () => {
  it('returns id boxberry', () => {
    expect(transformSelfCarrier().id).toBe('boxberry')
  })

  it('returns name Boxberry', () => {
    expect(transformSelfCarrier().name).toBe('Boxberry')
  })

  it('returns code boxberry', () => {
    expect(transformSelfCarrier().code).toBe('boxberry')
  })

  it('returns trackingUrlTemplate containing trackingNumber placeholder', () => {
    const template = transformSelfCarrier().trackingUrlTemplate
    expect(template).toContain('{trackingNumber}')
    expect(template).toContain('boxberry.ru')
  })

  it('returns isActive true', () => {
    expect(transformSelfCarrier().isActive).toBe(true)
  })

  it('produces output that parses against CarrierSchema', () => {
    expect(() => CarrierSchema.parse(transformSelfCarrier())).not.toThrow()
  })
})
