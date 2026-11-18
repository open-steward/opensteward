import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AisinoAccount } from '../../../../../../../src/verticals/accounting/adapters/aisino/transform/account'

function makeAccount(overrides: Partial<AisinoAccount> = {}): AisinoAccount {
  return {
    accountCode: '1001',
    accountName: 'Cash Account',
    accountType: 'asset',
    currency: 'CNY',
    ...overrides,
  }
}

describe('transformAccount (aisino)', () => {
  it('maps id from accountCode', () => { expect(transformAccount(makeAccount()).id).toBe('1001') })
  it('maps name from accountName', () => { expect(transformAccount(makeAccount()).name).toBe('Cash Account') })
  it('maps customerDefinedCode from accountCode', () => { expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1001') })
  it('maps type asset to ASSET', () => { expect(transformAccount(makeAccount({ accountType: 'asset' })).type).toBe('ASSET') })
  it('maps type liability to LIABILITY', () => { expect(transformAccount(makeAccount({ accountType: 'liability' })).type).toBe('LIABILITY') })
  it('maps type equity to EQUITY', () => { expect(transformAccount(makeAccount({ accountType: 'equity' })).type).toBe('EQUITY') })
  it('maps type revenue to INCOME', () => { expect(transformAccount(makeAccount({ accountType: 'revenue' })).type).toBe('INCOME') })
  it('maps type expense to EXPENSE', () => { expect(transformAccount(makeAccount({ accountType: 'expense' })).type).toBe('EXPENSE') })
  it('maps currency', () => { expect(transformAccount(makeAccount()).currency).toBe('CNY') })
  it('metadata identity', () => { const raw = makeAccount(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
