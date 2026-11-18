import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type GustoAccount } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/account'

function makeAccount(overrides: Partial<GustoAccount> = {}): GustoAccount {
  return {
    id: 'acct_001',
    account_number: '1000',
    name: 'Cash',
    account_type: 'asset',
    balance: 10000,
    is_active: true,
    ...overrides,
  }
}

describe('transformAccount (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformAccount(makeAccount({ id: 'acct_001' })).id).toBe('acct_001')
  })

  it('maps numeric id to string', () => {
    expect(transformAccount(makeAccount({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount({ name: 'Payroll Expense' })).name).toBe('Payroll Expense')
  })

  it('maps account_number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount({ account_number: '6000' })).customerDefinedCode).toBe('6000')
  })

  it('maps asset account type', () => {
    expect(transformAccount(makeAccount({ account_type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability account type', () => {
    expect(transformAccount(makeAccount({ account_type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity account type', () => {
    expect(transformAccount(makeAccount({ account_type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income account type', () => {
    expect(transformAccount(makeAccount({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense account type', () => {
    expect(transformAccount(makeAccount({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown account type to OTHER', () => {
    expect(transformAccount(makeAccount({ account_type: 'miscellaneous' })).type).toBe('OTHER')
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount({ balance: 5000 })).balance).toBe(5000)
  })

  it('maps active status', () => {
    expect(transformAccount(makeAccount({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount({ id: 'acct_001' }))
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
