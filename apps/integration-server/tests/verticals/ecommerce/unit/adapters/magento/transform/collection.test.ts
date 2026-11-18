import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawMagentoCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/magento/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawMagentoCategory> = {}): RawMagentoCategory {
  return {
    id: 42,
    parent_id: 2,
    name: 'Shirts',
    is_active: true,
    position: 1,
    level: 2,
    product_count: 8,
    updated_at: '2024-03-01T10:00:00.000Z',
    custom_attributes: [
      { attribute_code: 'url_key', value: 'shirts' },
      { attribute_code: 'description', value: 'All the shirts' },
    ],
    ...overrides,
  }
}

describe('transformCollection (Magento)', () => {
  it('maps canonical fields and stringifies the id', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Shirts')
    expect(result.handle).toBe('shirts')
    expect(result.description).toBe('All the shirts')
    expect(result.type).toBe('MANUAL')
    expect(result.productIds).toEqual([])
  })

  it('defaults missing handle/description gracefully', () => {
    const raw = makeCategory({ custom_attributes: [] })
    const result = transformCollection(raw)
    expect(result.handle).toBeUndefined()
    expect(result.description).toBeUndefined()
  })

  it('preserves raw payload in metadata unmodified', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const body = untransformCollection(canonical) as { category: Record<string, unknown> }
    expect(body.category['name']).toBe('Shirts')
    const attrs = body.category['custom_attributes'] as Array<{
      attribute_code: string
      value: unknown
    }>
    expect(attrs.find((a) => a.attribute_code === 'url_key')?.value).toBe('shirts')
  })
})
