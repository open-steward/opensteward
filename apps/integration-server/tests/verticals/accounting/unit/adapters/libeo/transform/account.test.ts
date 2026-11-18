import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type LibeoAccount } from '../../../../../../../src/verticals/accounting/adapters/libeo/transform/account'

function makeAccount(overrides: Partial<LibeoAccount> = {}): LibeoAccount {
  return {
    id: '1',
    code: '411000',
    label: 'Clients',
    is_active: true,
    balance: 5000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Clients')
    expect(result.customerDefinedCode).toBe('411000')
    expect(result.balance).toBe(5000)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
