import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type ZohoBooksAccount,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/account'

function makeAccount(overrides: Partial<ZohoBooksAccount> = {}): ZohoBooksAccount {
  return {
    account_id: 'acc-001',
    account_name: 'Cash on Hand',
    account_code: '1001',
    account_type: 'cash',
    description: 'Petty cash account',
    is_active: true,
    current_balance: 5000,
    currency_code: 'USD',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps account_id to id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-001')
  })

  it('maps account_name to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash on Hand')
  })

  it('maps account_code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1001')
  })

  it('maps description correctly', () => {
    expect(transformAccount(makeAccount()).description).toBe('Petty cash account')
  })

  it('maps current_balance to balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(5000)
  })

  it('maps currency_code to currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('USD')
  })

  it('maps is_active true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps is_active false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps cash account_type to ASSET', () => {
    expect(transformAccount(makeAccount({ account_type: 'cash' })).type).toBe('ASSET')
  })

  it('maps bank account_type to ASSET', () => {
    expect(transformAccount(makeAccount({ account_type: 'bank' })).type).toBe('ASSET')
  })

  it('maps accounts_receivable account_type to ASSET', () => {
    expect(transformAccount(makeAccount({ account_type: 'accounts_receivable' })).type).toBe('ASSET')
  })

  it('maps credit_card account_type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ account_type: 'credit_card' })).type).toBe('LIABILITY')
  })

  it('maps accounts_payable account_type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ account_type: 'accounts_payable' })).type).toBe('LIABILITY')
  })

  it('maps equity account_type to EQUITY', () => {
    expect(transformAccount(makeAccount({ account_type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income account_type to INCOME', () => {
    expect(transformAccount(makeAccount({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps expense account_type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown account_type to OTHER', () => {
    expect(transformAccount(makeAccount({ account_type: 'unknown_type' })).type).toBe('OTHER')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
