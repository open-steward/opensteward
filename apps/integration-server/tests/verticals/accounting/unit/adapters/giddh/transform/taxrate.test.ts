import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type GiddhTax,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/taxrate'

function makeRaw(overrides: Partial<GiddhTax> = {}): GiddhTax {
  return {
    uniqueName: 'gst-18',
    name: 'GST 18%',
    taxType: 'gst',
    taxAmount: 18,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('gst-18')
    expect(result.name).toBe('GST 18%')
    expect(result.description).toBe('gst')
    expect(result.rate).toBe(18)
    expect(result.isActive).toBe(true)
  })

  it('maps isActive false correctly', () => {
    expect(transformTaxRate(makeRaw({ isActive: false })).isActive).toBe(false)
  })

  it('maps cess tax type', () => {
    const result = transformTaxRate(makeRaw({ taxType: 'cess', taxAmount: 1 }))
    expect(result.description).toBe('cess')
    expect(result.rate).toBe(1)
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
})
