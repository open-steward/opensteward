import { describe, it, expect } from 'vitest'
import {
  transformTaxCode,
  type TipaltiTaxCode,
} from '../../../../../../../src/verticals/accounting/adapters/tipalti/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeRaw(overrides: Partial<TipaltiTaxCode> = {}): TipaltiTaxCode {
  return {
    id: 'tax-001',
    externalId: 'ext-tax-001',
    name: 'US Federal Withholding',
    rate: 24.0,
    active: true,
    payerEntities: ['entity-001'],
    createdAt: '2024-01-05T00:00:00.000Z',
    updatedAt: '2024-02-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('tipalti transformTaxCode', () => {
  it('maps id', () => {
    expect(transformTaxCode(makeRaw()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxCode(makeRaw()).name).toBe('US Federal Withholding')
  })

  it('maps rate', () => {
    expect(transformTaxCode(makeRaw()).rate).toBe(24.0)
  })

  it('maps active=true to isActive=true', () => {
    expect(transformTaxCode(makeRaw({ active: true })).isActive).toBe(true)
  })

  it('maps active=false to isActive=false', () => {
    expect(transformTaxCode(makeRaw({ active: false })).isActive).toBe(false)
  })

  it('maps createdAt to Date', () => {
    expect(transformTaxCode(makeRaw()).createdAt).toEqual(new Date('2024-01-05T00:00:00.000Z'))
  })

  it('maps updatedAt to Date', () => {
    expect(transformTaxCode(makeRaw()).updatedAt).toEqual(new Date('2024-02-10T00:00:00.000Z'))
  })

  it('passes TaxRateSchema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxCode(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformTaxCode(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformTaxCode({ id: 'tax-min' })).not.toThrow()
  })
})
