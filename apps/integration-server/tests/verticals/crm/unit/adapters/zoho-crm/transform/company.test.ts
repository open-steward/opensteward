import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawZohoAccount } from '../../../../../../../src/verticals/crm/adapters/zoho-crm/transform/company'

function makeRaw(overrides: Partial<RawZohoAccount> = {}): RawZohoAccount {
  return { id: 'ZOACC1', ...overrides }
}

describe('zoho-crm transformCompany', () => {
  it('maps id to string', () => {
    expect(transformCompany(makeRaw()).id).toBe('ZOACC1')
  })

  it('maps Account_Name to name', () => {
    expect(transformCompany(makeRaw({ Account_Name: 'Zoho Corp' })).name).toBe('Zoho Corp')
  })

  it('maps Website to domain', () => {
    expect(transformCompany(makeRaw({ Website: 'https://zoho.com' })).domain).toBe('https://zoho.com')
  })

  it('maps Employees to size as number', () => {
    expect(transformCompany(makeRaw({ Employees: '250' })).size).toBe(250)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('zoho-crm untransformCompany', () => {
  it('maps name to Account_Name', () => {
    expect(untransformCompany({ name: 'Acme' }).Account_Name).toBe('Acme')
  })

  it('maps size to Employees', () => {
    expect(untransformCompany({ size: 100 }).Employees).toBe(100)
  })
})
