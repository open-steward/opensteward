import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type BigcapitalTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<BigcapitalTaxRate> = {}): BigcapitalTaxRate {
  return {
    id: 5,
    name: 'US Sales Tax',
    code: 'US-SALES',
    rate: 8.75,
    description: 'State and local sales tax',
    isNonRecoverable: false,
    isCompound: false,
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTaxRate (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.id).toBe('5')
    expect(result.name).toBe('US Sales Tax')
    expect(result.description).toBe('State and local sales tax')
    expect(result.rate).toBe(8.75)
    expect(result.isActive).toBe(true)
  })

  it('maps active=false to isActive=false', () => {
    const result = transformTaxRate(makeRaw({ active: false }))
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when active is undefined', () => {
    const result = transformTaxRate(makeRaw({ active: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('parses dates as Date objects', () => {
    const result = transformTaxRate(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
