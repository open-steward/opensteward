import { describe, it, expect } from 'vitest'
import {
  transformCarrierFromProducts,
  type PplCzProduct,
} from '../../../../../../../src/verticals/logistics/adapters/ppl-cz/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

describe('transformCarrierFromProducts', () => {
  const products: PplCzProduct[] = [
    { code: 'BUSS', name: 'PPL Business' },
    { code: 'CONN', name: 'PPL Connect' },
    { code: 'PRIV', name: 'PPL Private' },
  ]

  it('returns a carrier with id=ppl-cz', () => {
    const result = transformCarrierFromProducts(products)
    expect(result.id).toBe('ppl-cz')
    expect(result.code).toBe('ppl-cz')
  })

  it('maps products to services array', () => {
    const result = transformCarrierFromProducts(products)
    expect(result.services).toHaveLength(3)
    const codes = result.services?.map((s) => s.code)
    expect(codes).toContain('BUSS')
    expect(codes).toContain('CONN')
  })

  it('filters out products without a code', () => {
    const withNull: PplCzProduct[] = [
      { code: 'BUSS', name: 'PPL Business' },
      { code: null, name: 'No code' },
      { name: 'Also no code' },
    ]
    const result = transformCarrierFromProducts(withNull)
    expect(result.services).toHaveLength(1)
  })

  it('returns services=undefined for empty product list', () => {
    const result = transformCarrierFromProducts([])
    expect(result.services).toBeUndefined()
  })

  it('isActive is true', () => {
    expect(transformCarrierFromProducts(products).isActive).toBe(true)
  })

  it('passes schema parse', () => {
    const result = transformCarrierFromProducts(products)
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
