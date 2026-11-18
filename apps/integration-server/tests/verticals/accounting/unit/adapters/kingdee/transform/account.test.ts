import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type KingdeeAccount } from '../../../../../../../src/verticals/accounting/adapters/kingdee/transform/account'

function makeAccount(overrides: Partial<KingdeeAccount> = {}): KingdeeAccount {
  return {
    acctId: 'acct-1',
    acctName: 'Cash Account',
    acctCode: '1001',
    acctType: 'asset',
    currency: 'CNY',
    ...overrides,
  }
}

describe('transformAccount (kingdee)', () => {
  it('maps id from acctId', () => { expect(transformAccount(makeAccount()).id).toBe('acct-1') })
  it('maps name from acctName', () => { expect(transformAccount(makeAccount()).name).toBe('Cash Account') })
  it('maps customerDefinedCode from acctCode', () => { expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1001') })
  it('maps type asset to ASSET', () => { expect(transformAccount(makeAccount({ acctType: 'asset' })).type).toBe('ASSET') })
  it('maps type liability to LIABILITY', () => { expect(transformAccount(makeAccount({ acctType: 'liability' })).type).toBe('LIABILITY') })
  it('maps type equity to EQUITY', () => { expect(transformAccount(makeAccount({ acctType: 'equity' })).type).toBe('EQUITY') })
  it('maps type revenue to INCOME', () => { expect(transformAccount(makeAccount({ acctType: 'revenue' })).type).toBe('INCOME') })
  it('maps type expense to EXPENSE', () => { expect(transformAccount(makeAccount({ acctType: 'expense' })).type).toBe('EXPENSE') })
  it('maps currency', () => { expect(transformAccount(makeAccount()).currency).toBe('CNY') })
  it('metadata identity', () => { const raw = makeAccount(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
