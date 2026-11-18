/**
 * Norce `transformProduct` — maps Commerce Query's `Products/Products`
 * entity to the canonical Product shape. Field names per the published
 * OpenAPI schema for `...ProductModel.Product`:
 * https://docs.norce.io/api-reference/query/queryproducts/openapi
 */
import { describe, it, expect } from 'vitest'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'
import {
  transformProduct,
  type RawNorceProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/norce/transform/product'

const MINIMAL: RawNorceProduct = { Id: 42 }

describe('Norce transformProduct', () => {
  it('produces output that satisfies the canonical Product schema', () => {
    const out = transformProduct({
      Id: 42,
      Code: 'WK-2026',
      DefaultName: 'Wireless Keyboard',
      DefaultDescription: 'A compact wireless keyboard.',
      DefaultUniqueUrlName: 'Wireless Keyboard!',
      DefaultTags: 'accessories, wireless',
      IsActive: true,
      Created: '2026-01-15T09:30:00Z',
      Updated: '2026-02-01T14:20:00Z',
    })
    expect(() => ProductSchema.parse(out)).not.toThrow()
  })

  it('minimal input still satisfies the schema', () => {
    const out = transformProduct(MINIMAL)
    expect(() => ProductSchema.parse(out)).not.toThrow()
  })

  it('maps id to a string', () => {
    expect(transformProduct(MINIMAL).id).toBe('42')
  })

  it('prefers DefaultName for title, falling back to Code then Id', () => {
    expect(transformProduct({ Id: 1, DefaultName: 'Keyboard' }).title).toBe('Keyboard')
    expect(transformProduct({ Id: 2, Code: 'ABC' }).title).toBe('ABC')
    expect(transformProduct({ Id: 3 }).title).toBe('3')
  })

  it('slugifies DefaultUniqueUrlName into a URL-safe handle', () => {
    const out = transformProduct({ Id: 4, DefaultUniqueUrlName: 'Wireless Keyboard!' })
    expect(out.handle).toBe('wireless-keyboard')
  })

  it('maps IsActive=false to ARCHIVED and defaults to ACTIVE otherwise', () => {
    expect(transformProduct({ Id: 5, IsActive: false }).status).toBe('ARCHIVED')
    expect(transformProduct({ Id: 6, IsActive: true }).status).toBe('ACTIVE')
    expect(transformProduct({ Id: 7 }).status).toBe('ACTIVE')
  })

  it('splits DefaultTags on commas and trims whitespace', () => {
    const out = transformProduct({ Id: 8, DefaultTags: ' accessories , wireless ' })
    expect(out.tags).toEqual(['accessories', 'wireless'])
  })

  it('converts Created/Updated to ISO 8601', () => {
    const out = transformProduct({ Id: 9, Created: '2026-01-15T09:30:00Z', Updated: 1770000000 })
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
    expect(out.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('preserves the raw record in metadata', () => {
    const raw: RawNorceProduct = { Id: 10, Code: 'X' }
    expect(transformProduct(raw).metadata).toBe(raw)
  })

  it('does not throw on missing optional fields', () => {
    expect(() => transformProduct({ Id: 0 })).not.toThrow()
  })
})
