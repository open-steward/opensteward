import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type IdokladAccount } from '../../../../../../../src/verticals/accounting/adapters/idoklad/transform/account'

function makeAccount(overrides: Partial<IdokladAccount> = {}): IdokladAccount {
  return {
    Id: '5',
    AccountNumber: '311',
    Name: 'Pohledávky z obchodní činnosti',
    AccountType: 'ASSET',
    CurrencyId: 'CZK',
    Balance: 25000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps Id to string id', () => {
    expect(transformAccount(makeAccount({ Id: 99 })).id).toBe('99')
  })

  it('maps name from Name field', () => {
    expect(transformAccount(makeAccount()).name).toBe('Pohledávky z obchodní činnosti')
  })

  it('maps customerDefinedCode from AccountNumber', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('311')
  })

  it('maps currency from CurrencyId', () => {
    expect(transformAccount(makeAccount()).currency).toBe('CZK')
  })

  it('maps balance from Balance field', () => {
    expect(transformAccount(makeAccount()).balance).toBe(25000)
  })

  it('returns undefined name when Name is missing', () => {
    expect(transformAccount(makeAccount({ Name: undefined })).name).toBeUndefined()
  })

  it('returns undefined currency when CurrencyId is missing', () => {
    expect(transformAccount(makeAccount({ CurrencyId: undefined })).currency).toBeUndefined()
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
