import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FreeeCompany } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/organization'

function makeRaw(overrides: Partial<FreeeCompany> = {}): FreeeCompany {
  return {
    id: 1,
    display_name: 'My Company',
    name: 'My Company Ltd',
    phone1: '03-9999-8888',
    country_code: 'JP',
    default_wallet_account_id: null,
    ...overrides,
  }
}

describe('transformOrganization (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.name).toBe('My Company')
    expect(result.legalName).toBe('My Company Ltd')
  })

  it('falls back to name when display_name is empty', () => {
    const result = transformOrganization(makeRaw({ display_name: '' }))
    expect(result.name).toBe('My Company Ltd')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
