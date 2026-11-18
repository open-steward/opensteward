import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type SzamlazzhuAccount } from '../../../../../../../src/verticals/accounting/adapters/szamlazzhu/transform/account'

function makeAccount(overrides: Partial<SzamlazzhuAccount> = {}): SzamlazzhuAccount {
  return {
    id: '90',
    code: '9000',
    name: 'Long-term Liabilities',
    active: true,
    balance: 200000,
    ...overrides,
  }
}

describe('transformAccount (szamlazzhu)', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('90')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Long-term Liabilities')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('9000')
  })

  it('maps ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(200000)
  })

  it('falls back to id when no code', () => {
    expect(transformAccount(makeAccount({ code: undefined })).customerDefinedCode).toBe('90')
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
