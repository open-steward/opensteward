import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type SmartbillAccount } from '../../../../../../../src/verticals/accounting/adapters/smartbill/transform/account'

function makeAccount(overrides: Partial<SmartbillAccount> = {}): SmartbillAccount {
  return {
    id: '50',
    code: '5000',
    name: 'Capital',
    active: true,
    balance: 100000,
    ...overrides,
  }
}

describe('transformAccount (smartbill)', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('50')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Capital')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('5000')
  })

  it('maps ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(100000)
  })

  it('falls back to id when no code', () => {
    expect(transformAccount(makeAccount({ code: undefined })).customerDefinedCode).toBe('50')
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
