import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MoyskladAccount } from '../../../../../../../src/verticals/accounting/adapters/moysklad/transform/account'

function makeAccount(overrides: Partial<MoyskladAccount> = {}): MoyskladAccount {
  return {
    id: 'acc-1',
    name: 'Main Bank Account',
    accountType: 'bankAccount',
    currency: 'RUB',
    ...overrides,
  }
}

describe('transformAccount (moysklad)', () => {
  it('maps id field', () => { expect(transformAccount(makeAccount()).id).toBe('acc-1') })
  it('maps name field', () => { expect(transformAccount(makeAccount()).name).toBe('Main Bank Account') })
  it('maps bankAccount type to ASSET', () => { expect(transformAccount(makeAccount({ accountType: 'bankAccount' })).type).toBe('ASSET') })
  it('maps cashAccount type to ASSET', () => { expect(transformAccount(makeAccount({ accountType: 'cashAccount' })).type).toBe('ASSET') })
  it('maps currency', () => { expect(transformAccount(makeAccount()).currency).toBe('RUB') })
  it('metadata identity', () => { const raw = makeAccount(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
