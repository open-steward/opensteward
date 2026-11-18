import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type TorgsoftAccount } from '../../../../../../../src/verticals/accounting/adapters/torgsoft/transform/account'

function makeAccount(overrides: Partial<TorgsoftAccount> = {}): TorgsoftAccount {
  return {
    id: 'acc-1',
    account_no: '2600',
    name: 'Розрахунковий рахунок',
    type: 'asset',
    currency: 'UAH',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-1')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Розрахунковий рахунок')
  })

  it('maps account_no to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('2600')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income type to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('sets status ACTIVE', () => {
    expect(transformAccount(makeAccount()).status).toBe('ACTIVE')
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('UAH')
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
