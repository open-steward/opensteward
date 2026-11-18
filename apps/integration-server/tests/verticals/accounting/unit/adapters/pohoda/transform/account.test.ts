import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type PohodaAccount } from '../../../../../../../src/verticals/accounting/adapters/pohoda/transform/account'

function makeAccount(overrides: Partial<PohodaAccount> = {}): PohodaAccount {
  return {
    id: '5',
    code: '311',
    name: 'Pohledávky z obchodních vztahů',
    type: 'ASSET',
    currency: 'CZK',
    balance: 50000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id to string', () => {
    expect(transformAccount(makeAccount({ id: 99 })).id).toBe('99')
  })

  it('maps name from name field', () => {
    expect(transformAccount(makeAccount()).name).toBe('Pohledávky z obchodních vztahů')
  })

  it('maps customerDefinedCode from code', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('311')
  })

  it('maps currency from currency field', () => {
    expect(transformAccount(makeAccount()).currency).toBe('CZK')
  })

  it('maps balance from balance field', () => {
    expect(transformAccount(makeAccount()).balance).toBe(50000)
  })

  it('returns undefined name when name is missing', () => {
    expect(transformAccount(makeAccount({ name: undefined })).name).toBeUndefined()
  })

  it('returns undefined currency when currency is missing', () => {
    expect(transformAccount(makeAccount({ currency: undefined })).currency).toBeUndefined()
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
