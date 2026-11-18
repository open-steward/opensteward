import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MaxioAccount } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/account'

function makeAccount(overrides: Partial<MaxioAccount> = {}): MaxioAccount {
  return {
    id: 1,
    name: 'Revenue Account',
    type: 'income',
    balance_in_cents: 500000,
    is_active: true,
    ...overrides,
  }
}

describe('transformAccount (Maxio)', () => {
  it('maps id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Revenue Account')
  })

  it('converts balance_in_cents to dollars', () => {
    expect(transformAccount(makeAccount({ balance_in_cents: 500000 })).balance).toBe(5000)
  })

  it('maps income type to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps is_active to status', () => {
    expect(transformAccount(makeAccount({ is_active: true })).status).toBe('ACTIVE')
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
