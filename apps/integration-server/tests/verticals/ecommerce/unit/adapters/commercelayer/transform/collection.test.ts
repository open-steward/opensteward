import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawCLSkuList,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeSkuList(overrides: Partial<RawCLSkuList> = {}): RawCLSkuList {
  return {
    id: 'sl-001',
    name: 'Summer Collection',
    slug: 'summer-collection',
    description: 'Summer 2024 products',
    manual: true,
    created_at: '2024-05-01T10:00:00.000Z',
    updated_at: '2024-05-15T12:00:00.000Z',
    _type: 'sku_lists',
    ...overrides,
  }
}

describe('transformCollection (Commerce Layer)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeSkuList())
    expect(result.id).toBe('sl-001')
    expect(result.title).toBe('Summer Collection')
    expect(result.handle).toBe('summer-collection')
    expect(result.description).toBe('Summer 2024 products')
  })

  it('maps manual collection type', () => {
    const result = transformCollection(makeSkuList({ manual: true }))
    expect(result.type).toBe('MANUAL')
  })

  it('maps smart collection type for regex-based', () => {
    const result = transformCollection(makeSkuList({ manual: false, sku_code_regex: '^SUMMER-' }))
    expect(result.type).toBe('SMART')
  })

  it('handles missing name gracefully', () => {
    const result = transformCollection(makeSkuList({ name: undefined }))
    expect(result.title).toBe('')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeSkuList()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeSkuList())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (Commerce Layer)', () => {
  it('produces JSON:API body', () => {
    const body = untransformCollection({
      title: 'Winter Sale',
      handle: 'winter-sale',
      description: 'Winter clearance',
      type: 'MANUAL',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('sku_lists')
    expect(body.data.attributes['name']).toBe('Winter Sale')
    expect(body.data.attributes['slug']).toBe('winter-sale')
    expect(body.data.attributes['manual']).toBe(true)
  })

  it('sets manual=false for SMART type', () => {
    const body = untransformCollection({
      title: 'Auto List',
      type: 'SMART',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.attributes['manual']).toBe(false)
  })
})
