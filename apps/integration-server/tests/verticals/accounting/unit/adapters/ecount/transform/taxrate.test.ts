import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type EcountVatCode,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/taxrate'

function makeRaw(overrides: Partial<EcountVatCode> = {}): EcountVatCode {
  return {
    VAT_CODE: 'VAT10',
    VAT_NAME: 'Standard VAT 10%',
    VAT_RATE: 10,
    USE_YN: 'Y',
    ...overrides,
  }
}

describe('transformTaxRate (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('VAT10')
    expect(result.name).toBe('Standard VAT 10%')
    expect(result.rate).toBe(10)
    expect(result.isActive).toBe(true)
  })

  it('maps USE_YN N to isActive false', () => {
    const result = transformTaxRate(makeRaw({ USE_YN: 'N' }))
    expect(result.isActive).toBe(false)
  })

  it('defaults rate to 0 when VAT_RATE is absent', () => {
    const result = transformTaxRate(makeRaw({ VAT_RATE: undefined }))
    expect(result.rate).toBe(0)
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
