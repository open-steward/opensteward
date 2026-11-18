import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MoneyForwardMe } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/organization'

function makeRaw(overrides: Partial<MoneyForwardMe> = {}): MoneyForwardMe {
  return {
    id: 'org-001',
    name: 'My Company Ltd',
    display_name: 'My Company',
    email: 'admin@mycompany.jp',
    ...overrides,
  }
}

describe('transformOrganization (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.name).toBe('My Company')
    expect(result.legalName).toBe('My Company Ltd')
  })

  it('falls back to name when display_name is null', () => {
    const result = transformOrganization(makeRaw({ display_name: null }))
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
