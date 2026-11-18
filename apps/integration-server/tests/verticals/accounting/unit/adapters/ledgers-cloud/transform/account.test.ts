import { describe, it, expect } from 'vitest'
import { transformAccount } from '../../../../../../../src/verticals/accounting/adapters/ledgers-cloud/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

describe('transformAccount', () => {
  const base = {
    id: '42',
    name: 'Trade Receivables',
    account_type: 'Asset',
    account_code: '1200',
    balance: 75000,
    currency: 'USD',
    is_active: true,
    created_at: '2024-01-10T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
  }

  it('maps core fields', () => {
    const result = transformAccount(base)
    expect(result.id).toBe('42')
    expect(result.name).toBe('Trade Receivables')
    expect(result.customerDefinedCode).toBe('1200')
    expect(result.balance).toBe(75000)
    expect(result.currency).toBe('USD')
  })

  it('maps account_type Asset to ASSET', () => {
    expect(transformAccount(base).type).toBe('ASSET')
  })

  it('maps account_type Liability to LIABILITY', () => {
    expect(transformAccount({ ...base, account_type: 'Liability' }).type).toBe('LIABILITY')
  })

  it('maps account_type Equity to EQUITY', () => {
    expect(transformAccount({ ...base, account_type: 'Equity' }).type).toBe('EQUITY')
  })

  it('maps account_type Income to INCOME', () => {
    expect(transformAccount({ ...base, account_type: 'Income' }).type).toBe('INCOME')
  })

  it('maps account_type Expense to EXPENSE', () => {
    expect(transformAccount({ ...base, account_type: 'Expense' }).type).toBe('EXPENSE')
  })

  it('maps is_active=true to ACTIVE', () => {
    expect(transformAccount(base).status).toBe('ACTIVE')
  })

  it('maps is_active=false to ARCHIVED', () => {
    expect(transformAccount({ ...base, is_active: false }).status).toBe('ARCHIVED')
  })

  it('falls back to account_name when name absent', () => {
    const result = transformAccount({ ...base, name: undefined, account_name: 'Fallback Name' })
    expect(result.name).toBe('Fallback Name')
  })

  it('falls back to current_balance when balance absent', () => {
    const result = transformAccount({ ...base, balance: undefined, current_balance: 99000 })
    expect(result.balance).toBe(99000)
  })

  it('falls back to code when account_code absent', () => {
    const result = transformAccount({ ...base, account_code: undefined, code: 'ALT-CODE' })
    expect(result.customerDefinedCode).toBe('ALT-CODE')
  })

  it('parses dates as Date objects', () => {
    const result = transformAccount(base)
    expect(result.createdAt).toEqual(new Date('2024-01-10T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes schema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(base))).not.toThrow()
  })
})
