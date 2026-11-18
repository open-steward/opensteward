import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawBitrix24Company } from '../../../../../../../src/verticals/crm/adapters/bitrix24/transform/company'

function makeRaw(overrides: Partial<RawBitrix24Company> = {}): RawBitrix24Company {
  return { ID: '1', TITLE: 'Acme', ...overrides }
}

describe('bitrix24 transformCompany', () => {
  it('maps ID to id string', () => {
    expect(transformCompany(makeRaw()).id).toBe('1')
  })

  it('maps name from TITLE', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from first WEB entry', () => {
    const result = transformCompany(makeRaw({ WEB: [{ VALUE: 'acme.com' }] }))
    expect(result.domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany maps TITLE back', () => {
    const result = untransformCompany({ name: 'Corp' })
    expect(result.TITLE).toBe('Corp')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
