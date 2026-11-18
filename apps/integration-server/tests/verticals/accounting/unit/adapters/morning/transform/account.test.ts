import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MorningAccount } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/account'

function makeAccount(overrides: Partial<MorningAccount> = {}): MorningAccount {
  return {
    id: 'acc_1',
    name: 'Bank Account',
    type: 'asset',
    balance: 10000,
    currency: 'ILS',
    ...overrides,
  }
}

describe('transformAccount (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc_1')
    expect(result.name).toBe('Bank Account')
    expect(result.balance).toBe(10000)
    expect(result.currency).toBe('ILS')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps type asset to ASSET', () => {
    const result = transformAccount(makeAccount({ type: 'asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps type liability to LIABILITY', () => {
    const result = transformAccount(makeAccount({ type: 'liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps type income to INCOME', () => {
    const result = transformAccount(makeAccount({ type: 'income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps type expense to EXPENSE', () => {
    const result = transformAccount(makeAccount({ type: 'expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    const result = transformAccount(makeAccount({ type: 'unknown' }))
    expect(result.type).toBe('OTHER')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
