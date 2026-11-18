import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FlowAccountAccount } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/account'

function makeAccount(overrides: Partial<FlowAccountAccount> = {}): FlowAccountAccount {
  return {
    id: 300,
    code: '1001',
    name: 'Cash',
    accountCategory: 'asset',
    balance: 75000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('300')
    expect(result.name).toBe('Cash')
    expect(result.customerDefinedCode).toBe('1001')
    expect(result.balance).toBe(75000)
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps asset category', () => {
    expect(transformAccount(makeAccount({ accountCategory: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability category', () => {
    expect(transformAccount(makeAccount({ accountCategory: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity category', () => {
    expect(transformAccount(makeAccount({ accountCategory: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income category', () => {
    expect(transformAccount(makeAccount({ accountCategory: 'income' })).type).toBe('INCOME')
  })

  it('maps expense category', () => {
    expect(transformAccount(makeAccount({ accountCategory: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown category to OTHER', () => {
    expect(transformAccount(makeAccount({ accountCategory: 'other' })).type).toBe('OTHER')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
