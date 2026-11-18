import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type YonyouAccount } from '../../../../../../../src/verticals/accounting/adapters/yonyou/transform/account'

function makeAccount(overrides: Partial<YonyouAccount> = {}): YonyouAccount {
  return {
    id: 'acc-1',
    name: 'Cash Account',
    acctype: 1,
    currency: 'CNY',
    ...overrides,
  }
}

describe('transformAccount (yonyou)', () => {
  it('maps id field', () => { expect(transformAccount(makeAccount()).id).toBe('acc-1') })
  it('maps name field', () => { expect(transformAccount(makeAccount()).name).toBe('Cash Account') })
  it('maps acctype 1 to ASSET', () => { expect(transformAccount(makeAccount({ acctype: 1 })).type).toBe('ASSET') })
  it('maps acctype 2 to LIABILITY', () => { expect(transformAccount(makeAccount({ acctype: 2 })).type).toBe('LIABILITY') })
  it('maps acctype 3 to EQUITY', () => { expect(transformAccount(makeAccount({ acctype: 3 })).type).toBe('EQUITY') })
  it('maps acctype 4 to INCOME', () => { expect(transformAccount(makeAccount({ acctype: 4 })).type).toBe('INCOME') })
  it('maps acctype 5 to EXPENSE', () => { expect(transformAccount(makeAccount({ acctype: 5 })).type).toBe('EXPENSE') })
  it('maps currency', () => { expect(transformAccount(makeAccount()).currency).toBe('CNY') })
  it('metadata identity', () => { const raw = makeAccount(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
