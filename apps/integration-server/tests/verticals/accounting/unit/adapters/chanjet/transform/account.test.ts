import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ChanjetAccount } from '../../../../../../../src/verticals/accounting/adapters/chanjet/transform/account'

function makeAccount(overrides: Partial<ChanjetAccount> = {}): ChanjetAccount {
  return {
    accountId: 'acc-1',
    accountName: 'Bank Account',
    accountCode: '1001',
    accountType: 'asset',
    currency: 'CNY',
    ...overrides,
  }
}

describe('transformAccount (chanjet)', () => {
  it('maps id from accountId', () => { expect(transformAccount(makeAccount()).id).toBe('acc-1') })
  it('maps name from accountName', () => { expect(transformAccount(makeAccount()).name).toBe('Bank Account') })
  it('maps customerDefinedCode from accountCode', () => { expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1001') })
  it('maps type asset to ASSET', () => { expect(transformAccount(makeAccount({ accountType: 'asset' })).type).toBe('ASSET') })
  it('maps type liability to LIABILITY', () => { expect(transformAccount(makeAccount({ accountType: 'liability' })).type).toBe('LIABILITY') })
  it('maps type equity to EQUITY', () => { expect(transformAccount(makeAccount({ accountType: 'equity' })).type).toBe('EQUITY') })
  it('maps type income to INCOME', () => { expect(transformAccount(makeAccount({ accountType: 'income' })).type).toBe('INCOME') })
  it('maps type expense to EXPENSE', () => { expect(transformAccount(makeAccount({ accountType: 'expense' })).type).toBe('EXPENSE') })
  it('maps currency', () => { expect(transformAccount(makeAccount()).currency).toBe('CNY') })
  it('metadata identity', () => { const raw = makeAccount(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
