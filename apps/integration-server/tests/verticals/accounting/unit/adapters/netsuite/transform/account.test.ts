import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type NetSuiteAccount } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/account'

function makeAccount(overrides: Partial<NetSuiteAccount> = {}): NetSuiteAccount {
  return { id: 200, acctNumber: '1000', acctName: 'Cash', acctType: 'Bank', isInactive: false, balance: 5000, ...overrides }
}

describe('transformAccount (netsuite)', () => {
  it('maps id, code, name', () => {
    const r = transformAccount(makeAccount())
    expect(r.id).toBe('200')
    expect(r.customerDefinedCode).toBe('1000')
    expect(r.name).toBe('Cash')
  })
  it('isInactive false → ACTIVE', () => { expect(transformAccount(makeAccount()).status).toBe('ACTIVE') })
  it('isInactive true → ARCHIVED', () => { expect(transformAccount(makeAccount({ isInactive: true })).status).toBe('ARCHIVED') })
  it('passes raw as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
