import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FinmapAccount } from '../../../../../../../src/verticals/accounting/adapters/finmap/transform/account'

function makeAccount(overrides: Partial<FinmapAccount> = {}): FinmapAccount {
  return {
    id: 'acc-1',
    name: 'Основний рахунок',
    type: 'bank',
    currency: 'UAH',
    balance: 50000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-1')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Основний рахунок')
  })

  it('maps bank type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'bank' })).type).toBe('ASSET')
  })

  it('maps cash type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'cash' })).type).toBe('ASSET')
  })

  it('maps credit type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'credit' })).type).toBe('LIABILITY')
  })

  it('maps income type to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(50000)
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
