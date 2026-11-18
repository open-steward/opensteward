import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type Unit4Account } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/account'

function makeAccount(overrides: Partial<Unit4Account> = {}): Unit4Account {
  return {
    accountId: 'acct_001',
    accountCode: '1100',
    name: 'Accounts Receivable',
    accountType: 'asset',
    balance: 50000,
    isActive: true,
    ...overrides,
  }
}

describe('transformAccount (Unit4)', () => {
  it('maps accountId to string id', () => {
    expect(transformAccount(makeAccount({ accountId: 'acct_001' })).id).toBe('acct_001')
  })

  it('maps numeric accountId to string', () => {
    expect(transformAccount(makeAccount({ accountId: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount({ name: 'Cash' })).name).toBe('Cash')
  })

  it('maps accountCode to customerDefinedCode', () => {
    expect(transformAccount(makeAccount({ accountCode: '2000' })).customerDefinedCode).toBe('2000')
  })

  it('maps asset account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'asset' })).type).toBe('ASSET')
  })

  it('maps fund account type to ASSET', () => {
    expect(transformAccount(makeAccount({ accountType: 'fund' })).type).toBe('ASSET')
  })

  it('maps liability account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'income' })).type).toBe('INCOME')
  })

  it('maps expense account type', () => {
    expect(transformAccount(makeAccount({ accountType: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps cost account type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ accountType: 'cost' })).type).toBe('EXPENSE')
  })

  it('maps unknown account type to OTHER', () => {
    expect(transformAccount(makeAccount({ accountType: 'misc' })).type).toBe('OTHER')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount({ balance: 10000 })).balance).toBe(10000)
  })

  it('maps active status', () => {
    expect(transformAccount(makeAccount({ isActive: true })).status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ isActive: false })).status).toBe('ARCHIVED')
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount({ accountId: 'acct_001' }))
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
