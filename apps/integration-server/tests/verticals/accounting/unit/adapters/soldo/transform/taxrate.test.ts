import { describe, it, expect } from 'vitest'
import {
  transformVatRate,
  type SoldoVatRate,
} from '../../../../../../../src/verticals/accounting/adapters/soldo/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<SoldoVatRate> = {}): SoldoVatRate {
  return {
    id: 'vat_std',
    code: 'STD',
    name: 'Standard Rate',
    description: 'UK standard VAT rate 20%',
    percentage: 20,
    enabled: true,
    creation_time: '2024-01-01T00:00:00.000Z',
    last_update_time: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformVatRate (soldo)', () => {
  it('maps id', () => {
    expect(transformVatRate(makeRaw()).id).toBe('vat_std')
  })

  it('maps name', () => {
    expect(transformVatRate(makeRaw()).name).toBe('Standard Rate')
  })

  it('falls back to code when name is absent', () => {
    expect(transformVatRate(makeRaw({ name: undefined })).name).toBe('STD')
  })

  it('maps description', () => {
    expect(transformVatRate(makeRaw()).description).toBe('UK standard VAT rate 20%')
  })

  it('maps percentage to rate', () => {
    expect(transformVatRate(makeRaw()).rate).toBe(20)
  })

  it('maps enabled=true to isActive=true', () => {
    expect(transformVatRate(makeRaw({ enabled: true })).isActive).toBe(true)
  })

  it('maps enabled=false to isActive=false', () => {
    expect(transformVatRate(makeRaw({ enabled: false })).isActive).toBe(false)
  })

  it('maps creation_time to createdAt Date', () => {
    expect(transformVatRate(makeRaw()).createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('maps last_update_time to updatedAt Date', () => {
    expect(transformVatRate(makeRaw()).updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes TaxRateSchema.parse without throwing', () => {
    expect(() => TaxRateSchema.parse(transformVatRate(makeRaw()))).not.toThrow()
  })
})
