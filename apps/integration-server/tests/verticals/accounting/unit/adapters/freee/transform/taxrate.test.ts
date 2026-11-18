import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type FreeeTaxRate } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/taxrate'

/**
 * One item of GET /api/1/taxes/companies/{company_id} as freee's OpenAPI
 * document declares it: `code`, `name`, `name_ja`, `display_category` and
 * `available`, all required. There is no `id` and no rate field: the rate is
 * the one `display_category` displays.
 */
function makeRaw(overrides: Partial<FreeeTaxRate> = {}): FreeeTaxRate {
  return {
    code: 21,
    name: 'sales_with_tax',
    name_ja: '課税売上',
    display_category: 'tax_10',
    available: true,
    ...overrides,
  }
}

describe('transformTaxRate (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('21')
    expect(result.name).toBe('課税売上')
    expect(result.rate).toBe(10)
    expect(result.isActive).toBe(true)
  })

  it('uses the tax code as the id, so rows stay distinct', () => {
    const ids = [makeRaw({ code: 21 }), makeRaw({ code: 34 })].map((r) => transformTaxRate(r).id)
    expect(ids).toEqual(['21', '34'])
  })

  it('maps isActive from the documented `available` setting', () => {
    expect(transformTaxRate(makeRaw({ available: false })).isActive).toBe(false)
  })

  it.each([
    ['tax_5', 5],
    ['tax_8', 8],
    ['tax_r8', 8],
    ['tax_10', 10],
    ['tax_5_e50', 5],
    ['tax_r8_e30', 8],
    ['tax_10_e80', 10],
  ])('reads the rate %s displays as %d', (category, rate) => {
    expect(transformTaxRate(makeRaw({ display_category: category })).rate).toBe(rate)
  })

  it('has no rate for a category with none (display_category null)', () => {
    expect(transformTaxRate(makeRaw({ display_category: null })).rate).toBeUndefined()
  })

  it.each(['tax_x', 'tax_10_special', 'x_tax_10'])(
    'invents no rate for %s, a category outside the documented enum',
    (category) => {
      expect(transformTaxRate(makeRaw({ display_category: category })).rate).toBeUndefined()
    },
  )

  it('maps description from name_ja', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.description).toBe('課税売上')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })

  it('satisfies the schema for a category with no rate (display_category null)', () => {
    const result = transformTaxRate(makeRaw({ code: 2, display_category: null, available: false }))
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
