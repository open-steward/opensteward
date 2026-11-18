import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawKommoCompany,
} from '../../../../../../../src/verticals/crm/adapters/kommo/transform/company'

function makeRaw(overrides: Partial<RawKommoCompany> = {}): RawKommoCompany {
  return { id: 1, name: 'Kommo Corp', ...overrides }
}

describe('kommo transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Kommo Corp')
  })

  it('extracts domain from SITE custom field', () => {
    const result = transformCompany(makeRaw({
      custom_fields_values: [
        { field_code: 'SITE', values: [{ value: 'https://kommo.com' }] },
      ],
    }))
    expect(result.domain).toBe('https://kommo.com')
  })

  it('maps responsible_user_id to owner_id', () => {
    expect(transformCompany(makeRaw({ responsible_user_id: 7 })).owner_id).toBe('7')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw({ id: 5 }))
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('kommo untransformCompany', () => {
  it('maps name', () => {
    const result = untransformCompany({ name: 'Test Corp' })
    expect(result.name).toBe('Test Corp')
  })
})
