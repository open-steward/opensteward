import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type InsertnexoAccount } from '../../../../../../../src/verticals/accounting/adapters/insertnexo/transform/account'

function makeAccount(overrides: Partial<InsertnexoAccount> = {}): InsertnexoAccount {
  return {
    Id: '5',
    Numer: '401',
    Nazwa: 'Koszty sprzedaży',
    Typ: 'EXPENSE',
    Waluta: 'PLN',
    Saldo: 3000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps Id to string id', () => {
    expect(transformAccount(makeAccount({ Id: 99 })).id).toBe('99')
  })

  it('maps name from Nazwa', () => {
    expect(transformAccount(makeAccount()).name).toBe('Koszty sprzedaży')
  })

  it('maps customerDefinedCode from Numer', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('401')
  })

  it('maps currency from Waluta', () => {
    expect(transformAccount(makeAccount()).currency).toBe('PLN')
  })

  it('maps balance from Saldo', () => {
    expect(transformAccount(makeAccount()).balance).toBe(3000)
  })

  it('returns undefined name when Nazwa is missing', () => {
    expect(transformAccount(makeAccount({ Nazwa: undefined })).name).toBeUndefined()
  })

  it('returns undefined currency when Waluta is missing', () => {
    expect(transformAccount(makeAccount({ Waluta: undefined })).currency).toBeUndefined()
  })

  it('metadata identity', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount({ Id: 99 }))
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
