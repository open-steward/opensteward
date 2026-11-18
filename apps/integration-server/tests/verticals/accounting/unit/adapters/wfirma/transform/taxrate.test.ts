import { describe, it, expect } from 'vitest'
import {
  transformVatCode,
  type WfirmaVatCode,
} from '../../../../../../../src/verticals/accounting/adapters/wfirma/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeVatCode(overrides: Partial<WfirmaVatCode> = {}): WfirmaVatCode {
  return {
    id: 1,
    label: 'Stawka 23%',
    rate: 23,
    code: '23',
    type: 'normal',
    priority: 1,
    created: '2020-01-01T00:00:00.000Z',
    modified: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformVatCode', () => {
  it('maps core fields correctly', () => {
    const result = transformVatCode(makeVatCode())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Stawka 23%')
    expect(result.description).toBe('normal')
    expect(result.rate).toBe(23)
    expect(result.isActive).toBe(true)
  })

  it('always sets isActive=true (wFirma has no active flag on vat_codes)', () => {
    const result = transformVatCode(makeVatCode())
    expect(result.isActive).toBe(true)
  })

  it('falls back to VAT code% name when label absent', () => {
    const result = transformVatCode(makeVatCode({ label: undefined, code: '8' }))
    expect(result.name).toBe('VAT 8%')
  })

  it('maps type as description', () => {
    const result = transformVatCode(makeVatCode({ type: 'exempt' }))
    expect(result.description).toBe('exempt')
  })

  it('handles string rate', () => {
    const result = transformVatCode(makeVatCode({ rate: '5.5' }))
    expect(result.rate).toBe(5.5)
  })

  it('parses dates as Date objects', () => {
    const result = transformVatCode(makeVatCode())
    expect(result.createdAt).toEqual(new Date('2020-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makeVatCode()
    const result = transformVatCode(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformVatCode(makeVatCode())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
