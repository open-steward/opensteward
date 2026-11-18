import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type RegateAccount } from '../../../../../../../src/verticals/accounting/adapters/regate/transform/account'

function makeAccount(overrides: Partial<RegateAccount> = {}): RegateAccount {
  return {
    id: '1',
    code: '411000',
    name: 'Clients',
    is_active: true,
    balance: 3000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Clients')
    expect(result.customerDefinedCode).toBe('411000')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('metadata identity', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
