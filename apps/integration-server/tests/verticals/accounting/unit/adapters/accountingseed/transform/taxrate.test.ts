import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type AccountingSeedTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/taxrate'

function makeTaxRate(overrides: Partial<AccountingSeedTaxRate> = {}): AccountingSeedTaxRate {
  return {
    Id: 'a0H5e000008VWX1',
    Name: 'Standard VAT',
    AcctSeed__Description__c: 'Standard value added tax',
    AcctSeed__Rate__c: 20,
    AcctSeed__Active__c: true,
    CreatedDate: '2024-01-01T00:00:00.000Z',
    LastModifiedDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from Id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('a0H5e000008VWX1')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard VAT')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('Standard value added tax')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(20)
  })

  it('maps isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ AcctSeed__Active__c: true })).isActive).toBe(true)
  })

  it('maps isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ AcctSeed__Active__c: false })).isActive).toBe(false)
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformTaxRate(makeTaxRate({ Name: '' })).name).toBeUndefined()
  })

  it('maps createdAt', () => {
    expect(transformTaxRate(makeTaxRate()).createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
