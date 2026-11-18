import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type SberbusinessAccount } from '../../../../../../../src/verticals/accounting/adapters/sberbusiness/transform/account'

function makeAccount(overrides: Partial<SberbusinessAccount> = {}): SberbusinessAccount {
  return {
    accountId: 'acc-1',
    accountName: 'Current Account',
    accountType: 'CURRENT',
    currency: 'RUB',
    ...overrides,
  }
}

describe('transformAccount (sberbusiness)', () => {
  it('maps id from accountId', () => { expect(transformAccount(makeAccount()).id).toBe('acc-1') })
  it('maps name from accountName', () => { expect(transformAccount(makeAccount()).name).toBe('Current Account') })
  it('maps CURRENT type to ASSET', () => { expect(transformAccount(makeAccount({ accountType: 'CURRENT' })).type).toBe('ASSET') })
  it('maps CASH type to ASSET', () => { expect(transformAccount(makeAccount({ accountType: 'CASH' })).type).toBe('ASSET') })
  it('maps currency', () => { expect(transformAccount(makeAccount()).currency).toBe('RUB') })
  it('metadata identity', () => { const raw = makeAccount(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
