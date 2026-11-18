import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany } from '../../../../../../../src/verticals/crm/adapters/upsales/transform/company'
import { COMPANY_LIST } from '../fixtures'

describe('upsales transformCompany (documented "Get company list" sample)', () => {
  it('maps a company with one account manager and null optionals', () => {
    const raw = COMPANY_LIST.data[0]!
    const c = CompanySchema.parse(transformCompany(raw))
    expect(c.id).toBe('2')
    expect(c.name).toBe('Salesboard')
    expect(c.phone).toBe('+46(0)8123456')
    expect(c.domain).toBeUndefined()
    expect(c.size).toBeUndefined()
    expect(c.owner_id).toBe('1')
    expect(c.created_at).toBe('2021-09-29T05:59:05.000Z')
    expect(c.updated_at).toBe('2021-09-29T05:59:05.000Z')
    expect(c.metadata).toEqual(raw)
  })

  it('maps webpage to domain and leaves owner unset without an account manager', () => {
    const raw = COMPANY_LIST.data[1]!
    const c = CompanySchema.parse(transformCompany(raw))
    expect(c.id).toBe('1')
    expect(c.domain).toBe('www.upsales.com')
    expect(c.owner_id).toBeUndefined()
  })

  it('maps noEmployees to size and does not pick an owner among several managers', () => {
    const raw = { ...COMPANY_LIST.data[0]!, noEmployees: 42, users: [{ id: 1 }, { id: 2 }] }
    const c = CompanySchema.parse(transformCompany(raw))
    expect(c.size).toBe(42)
    expect(c.owner_id).toBeUndefined()
  })

  it('parses a company whose phone is null, as the documented fields allow', () => {
    const raw = { ...COMPANY_LIST.data[1]!, phone: null }
    expect(CompanySchema.parse(transformCompany(raw)).phone).toBeUndefined()
  })

  it('keeps regDate and modDate apart', () => {
    const raw = { ...COMPANY_LIST.data[0]!, modDate: '2021-10-01T08:00:00.000Z' }
    const c = CompanySchema.parse(transformCompany(raw))
    expect(c.created_at).toBe('2021-09-29T05:59:05.000Z')
    expect(c.updated_at).toBe('2021-10-01T08:00:00.000Z')
  })

  it('throws on a company without its mandatory name rather than an empty one', () => {
    const raw = { ...COMPANY_LIST.data[0]!, name: null }
    expect(() => transformCompany(raw)).toThrow(/mandatory/)
  })
})
