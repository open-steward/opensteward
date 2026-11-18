import { describe, it, expect } from 'vitest'
import { transformCarrier } from '../../../../../../../src/verticals/logistics/adapters/ctt/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import { carrier } from '../fixtures'

describe('CTT transformCarrier', () => {
  it('maps Id and Name and parses as a canonical Carrier', () => {
    const raw = carrier(3)
    const out = CarrierSchema.parse(transformCarrier(raw))
    expect(out.id).toBe('3')
    expect(out.code).toBe('3')
    expect(out.name).toBe('Carrier 3')
    expect(out.metadata).toEqual(raw)
  })

  it('claims nothing the reply does not say (no isActive, no services)', () => {
    const out = transformCarrier(carrier(3))
    expect(out.isActive).toBeUndefined()
    expect(out.services).toBeUndefined()
  })
})
