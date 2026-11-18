/**
 * Haravan Collection transform — verified against
 * https://docs.haravan.com/docs/omni-apis/custom-collections/ and
 * .../smart-collections/ (identical field shape to Shopify's collections).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawHaravanCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawHaravanCollection> = {}): RawHaravanCollection {
  return {
    id: 1002326115,
    title: 'Sản phẩm mới',
    handle: 'san-pham-moi',
    body_html: '<p>New arrivals</p>',
    published_at: '2021-01-01T00:00:00Z',
    updated_at: '2021-01-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (haravan)', () => {
  it('maps a custom_collection as MANUAL', () => {
    const result = transformCollection(makeRaw(), 'MANUAL')
    expect(result.id).toBe('1002326115')
    expect(result.type).toBe('MANUAL')
    expect(result.description).toBe('<p>New arrivals</p>')
  })

  it('maps a smart_collection as SMART', () => {
    expect(transformCollection(makeRaw(), 'SMART').type).toBe('SMART')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeRaw(), 'MANUAL'))).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const body = untransformCollection(transformCollection(makeRaw(), 'MANUAL'))
    expect(body['title']).toBe('Sản phẩm mới')
  })
})
