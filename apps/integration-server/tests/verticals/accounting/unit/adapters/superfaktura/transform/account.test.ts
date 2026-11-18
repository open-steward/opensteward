import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type SuperfakturaAccount } from '../../../../../../../src/verticals/accounting/adapters/superfaktura/transform/account'

function makeAccount(overrides: Partial<SuperfakturaAccount> = {}): SuperfakturaAccount {
  return { id: '30', number: '321000', name: 'Bankový účet', type: 'bank', currency: 'EUR', balance: 5000, ...overrides }
}

describe('transformAccount', () => {
  it('maps id', () => { expect(transformAccount(makeAccount()).id).toBe('30') })
  it('maps name', () => { expect(transformAccount(makeAccount()).name).toBe('Bankový účet') })
  it('maps number to customerDefinedCode', () => { expect(transformAccount(makeAccount()).customerDefinedCode).toBe('321000') })
  it('maps currency', () => { expect(transformAccount(makeAccount()).currency).toBe('EUR') })
  it('maps balance', () => { expect(transformAccount(makeAccount()).balance).toBe(5000) })
  it('metadata identity', () => { const raw = makeAccount(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
