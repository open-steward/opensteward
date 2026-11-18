import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MoneyForwardAccountItem } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/account'

function makeRaw(overrides: Partial<MoneyForwardAccountItem> = {}): MoneyForwardAccountItem {
  return {
    id: 'acct-500',
    name: 'Sales Account',
    account_category: 'income',
    ...overrides,
  }
}

describe('transformAccount (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('acct-500')
    expect(result.name).toBe('Sales Account')
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null account_category gracefully', () => {
    const result = transformAccount(makeRaw({ account_category: null }))
    expect(result).toBeDefined()
    expect(result.status).toBe('ACTIVE')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
