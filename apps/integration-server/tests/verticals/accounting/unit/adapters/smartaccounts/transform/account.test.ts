import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type SmartaccountsAccount } from '../../../../../../../src/verticals/accounting/adapters/smartaccounts/transform/account'

function makeAccount(overrides: Partial<SmartaccountsAccount> = {}): SmartaccountsAccount {
  return {
    id: '20',
    code: '2000',
    name: 'Bank Account',
    active: true,
    balance: 10000,
    ...overrides,
  }
}

describe('transformAccount (smartaccounts)', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('20')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Bank Account')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('2000')
  })

  it('maps ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(10000)
  })

  it('falls back to id when no code', () => {
    expect(transformAccount(makeAccount({ code: undefined })).customerDefinedCode).toBe('20')
  })

  it('metadata identity', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
