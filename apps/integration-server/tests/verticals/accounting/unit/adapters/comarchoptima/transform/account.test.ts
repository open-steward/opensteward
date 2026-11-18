import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ComarchoptimaAccount } from '../../../../../../../src/verticals/accounting/adapters/comarchoptima/transform/account'

function makeAccount(overrides: Partial<ComarchoptimaAccount> = {}): ComarchoptimaAccount {
  return {
    id: '5',
    numer: '401',
    nazwa: 'Koszty operacyjne',
    typ: 'EXPENSE',
    waluta: 'PLN',
    saldo: 5000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id to string', () => {
    expect(transformAccount(makeAccount({ id: 99 })).id).toBe('99')
  })

  it('maps name from nazwa', () => {
    expect(transformAccount(makeAccount()).name).toBe('Koszty operacyjne')
  })

  it('maps customerDefinedCode from numer', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('401')
  })

  it('maps currency from waluta', () => {
    expect(transformAccount(makeAccount()).currency).toBe('PLN')
  })

  it('maps balance from saldo', () => {
    expect(transformAccount(makeAccount()).balance).toBe(5000)
  })

  it('returns undefined name when nazwa is missing', () => {
    expect(transformAccount(makeAccount({ nazwa: undefined })).name).toBeUndefined()
  })

  it('returns undefined currency when waluta is missing', () => {
    expect(transformAccount(makeAccount({ waluta: undefined })).currency).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount({ id: 99 }))
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
