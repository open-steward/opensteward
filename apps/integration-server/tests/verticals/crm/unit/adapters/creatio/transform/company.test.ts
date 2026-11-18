import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawCreatioAccount } from '../../../../../../../src/verticals/crm/adapters/creatio/transform/company'

function makeRaw(overrides: Partial<RawCreatioAccount> = {}): RawCreatioAccount {
  return { Id: 'a1', Name: 'Acme', ...overrides }
}

describe('creatio transformCompany', () => {
  it('maps Id to id string', () => {
    expect(transformCompany(makeRaw()).id).toBe('a1')
  })

  it('maps Name to name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme')
  })

  it('maps domain from Web', () => {
    expect(transformCompany(makeRaw({ Web: 'acme.com' })).domain).toBe('acme.com')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany maps Name', () => {
    expect(untransformCompany({ name: 'Corp' }).Name).toBe('Corp')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
