import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AxonautAccount } from '../../../../../../../src/verticals/accounting/adapters/axonaut/transform/account'

function makeAccount(overrides: Partial<AxonautAccount> = {}): AxonautAccount {
  return {
    id: '5',
    code: '411000',
    name: 'Clients',
    is_active: true,
    balance: 5000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('5')
    expect(result.customerDefinedCode).toBe('411000')
    expect(result.name).toBe('Clients')
    expect(result.balance).toBe(5000)
  })

  it('maps is_active=true to ACTIVE', () => {
    expect(transformAccount(makeAccount({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps is_active=false to ARCHIVED', () => {
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
