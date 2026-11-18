import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type ShipdayCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/shipday/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<ShipdayCarrier> = {}): ShipdayCarrier {
  return {
    id: 7,
    name: 'Mike Driver',
    email: 'mike@deliverco.example',
    phone_number: '+14155550100',
    isActive: true,
    ...overrides,
  }
}

describe('transformCarrier (shipday)', () => {
  it('maps id from numeric id (string-coerced)', () => {
    expect(transformCarrier(makeCarrier()).id).toBe('7')
  })

  it('maps code from numeric id (string-coerced)', () => {
    expect(transformCarrier(makeCarrier()).code).toBe('7')
  })

  it('maps name from carrier name', () => {
    expect(transformCarrier(makeCarrier()).name).toBe('Mike Driver')
  })

  it('maps isActive from isActive field', () => {
    expect(transformCarrier(makeCarrier({ isActive: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when field is null', () => {
    expect(transformCarrier(makeCarrier({ isActive: null })).isActive).toBe(true)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('handles null id gracefully', () => {
    const result = transformCarrier(makeCarrier({ id: null }))
    expect(result.id).toBeUndefined()
    expect(result.code).toBeUndefined()
  })

  it('passes CarrierSchema.parse without throwing', () => {
    const result = transformCarrier(makeCarrier())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
