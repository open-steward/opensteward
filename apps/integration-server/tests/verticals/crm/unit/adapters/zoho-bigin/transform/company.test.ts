import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawBiginAccount } from '../../../../../../../src/verticals/crm/adapters/zoho-bigin/transform/company'

function makeRaw(overrides: Partial<RawBiginAccount> = {}): RawBiginAccount {
  return { id: '1', ...overrides }
}

describe('zoho-bigin transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('1')
  })

  it('maps name from Account_Name', () => {
    expect(transformCompany(makeRaw({ Account_Name: 'Acme' })).name).toBe('Acme')
  })

  it('maps phone from Phone', () => {
    expect(transformCompany(makeRaw({ Phone: '+1234' })).phone).toBe('+1234')
  })

  it('maps domain from Website', () => {
    expect(transformCompany(makeRaw({ Website: 'acme.com' })).domain).toBe('acme.com')
  })

  it('maps industry from Industry', () => {
    expect(transformCompany(makeRaw({ Industry: 'Tech' })).industry).toBe('Tech')
  })

  it('maps owner_id from Owner.id', () => {
    expect(transformCompany(makeRaw({ Owner: { id: '7' } })).owner_id).toBe('7')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme', phone: '+1234' })
    expect(result.Account_Name).toBe('Acme')
    expect(result.Phone).toBe('+1234')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
