import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany, type RawSalesforceAccount } from '../../../../../../../src/verticals/crm/adapters/salesforce/transform/company'

function makeRaw(overrides: Partial<RawSalesforceAccount> = {}): RawSalesforceAccount {
  return { Id: 'ACC001', Name: 'Acme Corp', ...overrides }
}

describe('salesforce transformCompany', () => {
  it('maps Id to id', () => {
    expect(transformCompany(makeRaw()).id).toBe('ACC001')
  })

  it('maps Name to name', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Corp')
  })

  it('maps Website to domain', () => {
    expect(transformCompany(makeRaw({ Website: 'https://acme.com' })).domain).toBe('https://acme.com')
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

describe('salesforce untransformCompany', () => {
  it('maps name and domain to Salesforce fields', () => {
    const result = untransformCompany({ name: 'Acme', domain: 'acme.com' })
    expect(result.Name).toBe('Acme')
    expect(result.Website).toBe('acme.com')
  })
})
