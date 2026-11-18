import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type BillingoAccount } from '../../../../../../../src/verticals/accounting/adapters/billingo/transform/account'

function makeAccount(overrides: Partial<BillingoAccount> = {}): BillingoAccount {
  return {
    id: '70',
    code: '7000',
    name: 'Trade Receivables',
    active: true,
    balance: 50000,
    ...overrides,
  }
}

describe('transformAccount (billingo)', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('70')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Trade Receivables')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('7000')
  })

  it('maps ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(50000)
  })

  it('falls back to id when no code', () => {
    expect(transformAccount(makeAccount({ code: undefined })).customerDefinedCode).toBe('70')
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
