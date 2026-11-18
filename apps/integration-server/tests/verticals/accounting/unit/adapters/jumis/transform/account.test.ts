import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type JumisAccount } from '../../../../../../../src/verticals/accounting/adapters/jumis/transform/account'

function makeAccount(overrides: Partial<JumisAccount> = {}): JumisAccount {
  return {
    id: '30',
    code: '3000',
    name: 'Revenue',
    active: true,
    balance: 15000,
    ...overrides,
  }
}

describe('transformAccount (jumis)', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('30')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Revenue')
  })

  it('maps code', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('3000')
  })

  it('maps ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(15000)
  })

  it('falls back to id when no code', () => {
    expect(transformAccount(makeAccount({ code: undefined })).customerDefinedCode).toBe('30')
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
