/**
 * Shape verified against `components.schemas.Product` on
 * https://128.koronacloud.com/web/api/v3/openapi.json. No `variants`/price
 * are ever populated — see the file's own doc comment for why (no currency
 * field exists anywhere on this platform's monetary schemas).
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type KoronaProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/korona-pos/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(overrides: Partial<KoronaProduct> = {}): KoronaProduct {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    number: '1001',
    name: 'Espresso Beans 1kg',
    listed: true,
    descriptions: [{ type: 'DESCRIPTION', text: 'Dark roast espresso beans.' }],
    ...overrides,
  }
}

describe('transformProduct (korona-pos)', () => {
  it('maps id, title, description', () => {
    const result = transformProduct(makeRaw())
    expect(result.id).toBe('44444444-4444-4444-4444-444444444444')
    expect(result.title).toBe('Espresso Beans 1kg')
    expect(result.description).toBe('Dark roast espresso beans.')
  })

  it('falls back to number, then id, when name is absent', () => {
    expect(transformProduct(makeRaw({ name: undefined })).title).toBe('1001')
  })

  it('maps deactivated to ARCHIVED and listed to ACTIVE', () => {
    expect(transformProduct(makeRaw({ deactivated: true, listed: false })).status).toBe('ARCHIVED')
    expect(transformProduct(makeRaw({ listed: true, deactivated: false })).status).toBe('ACTIVE')
  })

  it('leaves status undefined when neither flag is reported', () => {
    expect(transformProduct(makeRaw({ listed: undefined, deactivated: undefined })).status).toBeUndefined()
  })

  it('never populates variants or any money field — no currency exists on this platform', () => {
    const result = transformProduct(makeRaw())
    expect(result.variants).toBeUndefined()
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeRaw()))).not.toThrow()
  })

  it('untransformProduct writes only name/descriptions/status flags', () => {
    const body = untransformProduct({ title: 'New Item', description: 'desc', status: 'ACTIVE' })
    expect(body).toEqual({
      name: 'New Item',
      descriptions: [{ type: 'DESCRIPTION', text: 'desc' }],
      listed: true,
    })
  })
})
