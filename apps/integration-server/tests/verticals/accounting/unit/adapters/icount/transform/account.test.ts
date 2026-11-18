import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ICountAccount } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/account'

function makeAccount(overrides: Partial<ICountAccount> = {}): ICountAccount {
  return {
    account_id: 'acc_10',
    account_name: 'Cash',
    type: 'asset',
    balance: 5000,
    currency: 'ILS',
    ...overrides,
  }
}

describe('transformAccount (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc_10')
    expect(result.name).toBe('Cash')
    expect(result.balance).toBe(5000)
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

  it('maps type equity to EQUITY', () => {
    const result = transformAccount(makeAccount({ type: 'equity' }))
    expect(result.type).toBe('EQUITY')
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
    const result = transformAccount(makeAccount({ type: 'misc' }))
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
