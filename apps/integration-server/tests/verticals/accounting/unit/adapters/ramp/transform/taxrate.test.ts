import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type RampTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/ramp/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxRate(overrides: Partial<RampTaxRate> = {}): RampTaxRate {
  return {
    id: 'tax_uuid_001',
    name: 'Sales Tax 8.75%',
    rate: '8.75',
    accounting_connection_id: 'conn_abc',
    accounting_gl_account_id: 'gl_2200',
    ramp_id: 'ramp_tax_001',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax_uuid_001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Sales Tax 8.75%')
  })

  it('parses rate string to float', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(8.75)
  })

  it('handles integer rate string', () => {
    expect(transformTaxRate(makeTaxRate({ rate: '10' })).rate).toBe(10)
  })

  it('rate is undefined when rate field is absent', () => {
    // parseFloat(undefined) = NaN; the transform handles via != null check
    const result = transformTaxRate(makeTaxRate({ rate: undefined }))
    expect(result.rate).toBeUndefined()
  })

  it('always sets isActive to true', () => {
    expect(transformTaxRate(makeTaxRate()).isActive).toBe(true)
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces output that passes TaxRateSchema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeTaxRate()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformTaxRate({ id: 'tax_001' })
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
