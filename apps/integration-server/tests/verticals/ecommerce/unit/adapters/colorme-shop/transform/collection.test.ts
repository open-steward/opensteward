/**
 * ColorMe Shop Group → canonical Collection — verified against
 * paths["/v1/groups"] in https://api.shop-pro.jp/v1/spec/open_api.json.
 * Categories are a strict single-parent hierarchy and are NOT mapped here —
 * see the transform file header for why groups were chosen instead.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawColormeGroup,
} from '../../../../../../../src/verticals/ecommerce/adapters/colorme-shop/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawColormeGroup> = {}): RawColormeGroup {
  return { id: 5456, name: '夏物', expl: 'Summer items', display_state: 'showing', ...overrides }
}

describe('transformCollection (colorme-shop)', () => {
  it('maps id and title from name', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('5456')
    expect(result.title).toBe('夏物')
    expect(result.type).toBe('MANUAL')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeRaw()))).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    expect(untransformCollection(transformCollection(makeRaw()))['name']).toBe('夏物')
  })
})
