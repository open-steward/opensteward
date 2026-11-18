import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type GiobbyAccount } from '../../../../../../../src/verticals/accounting/adapters/giobby/transform/account'

function makeAccount(overrides: Partial<GiobbyAccount> = {}): GiobbyAccount {
  return {
    id: 'ACC-001',
    code: '3000', name: 'Ricavi', active: true, balance: 10000,
    ...overrides,
  }
}

describe('transformAccount (giobby)', () => {
  it('maps core fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('ACC-001')
    expect(result.balance).toBe(10000)
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
