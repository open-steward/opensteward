import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FenbeitongAccount } from '../../../../../../../src/verticals/accounting/adapters/fenbeitong/transform/account'

function makeAccount(overrides: Partial<FenbeitongAccount> = {}): FenbeitongAccount {
  return {
    accountId: 'acc-1',
    accountName: 'Travel Expenses',
    accountCode: '6602',
    accountType: 'cost',
    currency: 'CNY',
    ...overrides,
  }
}

describe('transformAccount (fenbeitong)', () => {
  it('maps id from accountId', () => { expect(transformAccount(makeAccount()).id).toBe('acc-1') })
  it('maps name from accountName', () => { expect(transformAccount(makeAccount()).name).toBe('Travel Expenses') })
  it('maps customerDefinedCode from accountCode', () => { expect(transformAccount(makeAccount()).customerDefinedCode).toBe('6602') })
  it('maps type cost to EXPENSE', () => { expect(transformAccount(makeAccount({ accountType: 'cost' })).type).toBe('EXPENSE') })
  it('maps type revenue to INCOME', () => { expect(transformAccount(makeAccount({ accountType: 'revenue' })).type).toBe('INCOME') })
  it('maps type asset to ASSET', () => { expect(transformAccount(makeAccount({ accountType: 'asset' })).type).toBe('ASSET') })
  it('maps type liability to LIABILITY', () => { expect(transformAccount(makeAccount({ accountType: 'liability' })).type).toBe('LIABILITY') })
  it('maps type equity to EQUITY', () => { expect(transformAccount(makeAccount({ accountType: 'equity' })).type).toBe('EQUITY') })
  it('maps currency', () => { expect(transformAccount(makeAccount()).currency).toBe('CNY') })
  it('metadata identity', () => { const raw = makeAccount(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
