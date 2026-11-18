import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type RivileAccount } from '../../../../../../../src/verticals/accounting/adapters/rivile/transform/account'

function makeAccount(overrides: Partial<RivileAccount> = {}): RivileAccount {
  return {
    id: '40',
    code: '4000',
    name: 'Expenses',
    active: true,
    balance: 2000,
    ...overrides,
  }
}

describe('transformAccount (rivile)', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('40')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Expenses')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(2000)
  })

  it('falls back to id when no code', () => {
    expect(transformAccount(makeAccount({ code: undefined })).customerDefinedCode).toBe('40')
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
