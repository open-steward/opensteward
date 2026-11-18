import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type DeskeraTaxCode,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/taxrate'

function makeRaw(overrides: Partial<DeskeraTaxCode> = {}): DeskeraTaxCode {
  return {
    id: 'GST-9',
    name: 'GST 9%',
    percent: 9,
    type: 'BOTH',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('transformTaxRate (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('GST-9')
    expect(result.name).toBe('GST 9%')
    expect(result.rate).toBe(9)
    expect(result.isActive).toBe(true)
  })

  it('maps INACTIVE status to isActive false', () => {
    const result = transformTaxRate(makeRaw({ status: 'INACTIVE' }))
    expect(result.isActive).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('defaults rate to 0 when percent is absent', () => {
    const result = transformTaxRate(makeRaw({ percent: undefined }))
    expect(result.rate).toBe(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
