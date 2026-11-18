import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSupyBranch,
} from '../../../../../../../src/verticals/inventory/adapters/supy/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

function makeRaw(overrides: Partial<RawSupyBranch> = {}): RawSupyBranch {
  return {
    id: 'branch-1',
    name: 'Downtown Branch',
    code: 'DTB',
    brandId: 'brand-42',
    brandName: 'Cafe Chain',
    isActive: true,
    address: {
      line1: '10 Main St',
      city: 'Dubai',
      country: 'AE',
      postalCode: '00000',
    },
    timezone: 'Asia/Dubai',
    currency: 'AED',
    ...overrides,
  }
}

describe('transformLocation (supy)', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformLocation(makeRaw({ id: 'branch-1' }))
    expect(result.id).toBe('branch-1')
    expect(result.externalId).toBe('branch-1')
  })

  it('maps name and code', () => {
    const result = transformLocation(makeRaw())
    expect(result.name).toBe('Downtown Branch')
    expect(result.code).toBe('DTB')
  })

  it('type is always "warehouse"', () => {
    const result = transformLocation(makeRaw())
    expect(result.type).toBe('warehouse')
  })

  it('maps parentLocationId from brandId', () => {
    const result = transformLocation(makeRaw())
    expect(result.parentLocationId).toBe('brand-42')
  })

  it('maps address fields when present', () => {
    const result = transformLocation(makeRaw())
    expect(result.address).toBeDefined()
    expect(result.address!.line1).toBe('10 Main St')
    expect(result.address!.city).toBe('Dubai')
    expect(result.address!.country).toBe('AE')
  })

  it('omits address when raw.address is absent', () => {
    const result = transformLocation(makeRaw({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('isActive defaults to true when isActive is absent', () => {
    const result = transformLocation(makeRaw({ isActive: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when isActive is false', () => {
    const result = transformLocation(makeRaw({ isActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('platform is "supy"', () => {
    const result = transformLocation(makeRaw())
    expect(result.platform).toBe('supy')
  })

  it('passes LocationSchema validation', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
