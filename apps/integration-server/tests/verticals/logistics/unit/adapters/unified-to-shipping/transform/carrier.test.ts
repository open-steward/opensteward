import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type UnifiedShippingCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/unified-to-shipping/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<UnifiedShippingCarrier> = {}): UnifiedShippingCarrier {
  return {
    id: 'CARRIER-U-001',
    name: 'Unified Carrier',
    code: 'UCAR',
    isActive: true,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('unified-to-shipping transformCarrier', () => {
  it('maps id', () => {
    expect(transformCarrier(makeCarrier()).id).toBe('CARRIER-U-001')
  })

  it('maps name', () => {
    expect(transformCarrier(makeCarrier()).name).toBe('Unified Carrier')
  })

  it('maps code', () => {
    expect(transformCarrier(makeCarrier()).code).toBe('UCAR')
  })

  it('maps isActive', () => {
    expect(transformCarrier(makeCarrier()).isActive).toBe(true)
  })

  it('maps createdAt as Date', () => {
    expect(transformCarrier(makeCarrier()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt as Date', () => {
    expect(transformCarrier(makeCarrier()).updatedAt).toBeInstanceOf(Date)
  })

  it('handles null id as undefined', () => {
    expect(transformCarrier(makeCarrier({ id: null })).id).toBeUndefined()
  })

  it('handles null name as undefined', () => {
    expect(transformCarrier(makeCarrier({ name: null })).name).toBeUndefined()
  })

  it('passes metadata through', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeCarrier()))).not.toThrow()
  })
})
