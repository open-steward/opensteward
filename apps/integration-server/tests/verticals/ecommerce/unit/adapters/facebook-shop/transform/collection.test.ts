/**
 * Fixture fields are ProductSet fields from Meta's Business SDK
 * (productset.py `_field_types`: filter, id, name, product_count,
 * retailer_id, ...); the `filter` value is the product_sets reference's own
 * create example, `{"product_type":{"i_contains":"shirt"}}`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  type RawFacebookProductSet,
} from '../../../../../../../src/verticals/ecommerce/adapters/facebook-shop/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeSet(overrides: Partial<RawFacebookProductSet> = {}): RawFacebookProductSet {
  return {
    id: '1234567890',
    name: 'Test Set',
    filter: '{"product_type":{"i_contains":"shirt"}}',
    product_count: 12,
    retailer_id: 'set-shirts',
    ...overrides,
  }
}

describe('transformCollection (Facebook Shop)', () => {
  it('parses as a canonical Collection and keeps the raw record in metadata', () => {
    const raw = makeSet()
    const result = CollectionSchema.parse(transformCollection(raw))
    expect(result).toMatchObject({ id: '1234567890', title: 'Test Set' })
    expect(result.metadata).toEqual(raw)
  })

  it('maps no description or type: ProductSet documents neither', () => {
    const result = transformCollection(makeSet())
    expect(result.description).toBeUndefined()
    expect(result.type).toBeUndefined()
  })

  it('throws rather than invent a title when name is missing', () => {
    expect(() => transformCollection(makeSet({ name: undefined }))).toThrow(/no name/)
  })
})
