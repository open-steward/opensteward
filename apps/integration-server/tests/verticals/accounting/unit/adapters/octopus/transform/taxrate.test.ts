import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type OctopusVatCode,
} from '../../../../../../../src/verticals/accounting/adapters/octopus/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<OctopusVatCode> = {}): OctopusVatCode {
  return {
    vatCodeId: 21,
    code: 'VAT21',
    description: 'Belgian Standard Rate',
    rate: 21,
    active: true,
    ...overrides,
  }
}

describe('transformTaxRate (octopus)', () => {
  it('maps vatCodeId to id (string)', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('21')
  })

  it('falls back to code as id when vatCodeId absent', () => {
    expect(transformTaxRate(makeRaw({ vatCodeId: undefined })).id).toBe('VAT21')
  })

  it('builds name as "code – description"', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('VAT21 – Belgian Standard Rate')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeRaw()).description).toBe('Belgian Standard Rate')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(21)
  })

  it('maps active=true to isActive=true', () => {
    expect(transformTaxRate(makeRaw({ active: true })).isActive).toBe(true)
  })

  it('maps active=false to isActive=false', () => {
    expect(transformTaxRate(makeRaw({ active: false })).isActive).toBe(false)
  })

  it('defaults isActive=true when active is undefined', () => {
    expect(transformTaxRate(makeRaw({ active: undefined })).isActive).toBe(true)
  })

  it('uses percentage field when rate is absent', () => {
    expect(transformTaxRate(makeRaw({ rate: undefined, percentage: 6 })).rate).toBe(6)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeRaw()))).not.toThrow()
  })
})
