/**
 * Shape verified against `components.schemas.CommodityGroup` on
 * https://128.koronacloud.com/web/api/v3/openapi.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type KoronaCommodityGroup,
} from '../../../../../../../src/verticals/ecommerce/adapters/korona-pos/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<KoronaCommodityGroup> = {}): KoronaCommodityGroup {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    number: '10',
    name: 'Beverages',
    ...overrides,
  }
}

describe('transformCollection (korona-pos)', () => {
  it('maps id and title', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('11111111-1111-1111-1111-111111111111')
    expect(result.title).toBe('Beverages')
  })

  it('falls back to number, then id, when name is absent', () => {
    expect(transformCollection(makeRaw({ name: undefined })).title).toBe('10')
    expect(transformCollection(makeRaw({ name: undefined, number: undefined })).title).toBe(
      '11111111-1111-1111-1111-111111111111',
    )
  })

  it('is always MANUAL — no rule-based collection concept, and no description field exists', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
    expect(result.description).toBeUndefined()
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeRaw()))).not.toThrow()
  })

  it('untransformCollection writes only the documented name field', () => {
    expect(untransformCollection({ title: 'Snacks' })).toEqual({ name: 'Snacks' })
  })
})
