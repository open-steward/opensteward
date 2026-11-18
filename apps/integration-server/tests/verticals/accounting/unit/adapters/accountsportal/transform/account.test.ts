import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type APAccount,
} from '../../../../../../../src/verticals/accounting/adapters/accountsportal/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAPAccount(overrides: Partial<APAccount> = {}): APAccount {
  return {
    id: 10,
    name: 'Sales Revenue',
    description: 'Revenue from sales',
    nominal_code: '4000',
    account_type: 'income',
    is_active: true,
    currency: 'GBP',
    balance: 1250.5,
    ...overrides,
  }
}

describe('transformAccount (accountsportal)', () => {
  it('maps id as string', () => {
    expect(transformAccount(makeAPAccount({ id: 10 })).id).toBe('10')
  })

  it('maps name and description', () => {
    const result = transformAccount(makeAPAccount())
    expect(result.name).toBe('Sales Revenue')
    expect(result.description).toBe('Revenue from sales')
  })

  it('maps nominal_code to customerDefinedCode', () => {
    expect(transformAccount(makeAPAccount({ nominal_code: '4000' })).customerDefinedCode).toBe(
      '4000',
    )
  })

  it('maps "income" account_type to INCOME', () => {
    expect(transformAccount(makeAPAccount({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps "sales" substring to INCOME', () => {
    expect(transformAccount(makeAPAccount({ account_type: 'Sales Tax' })).type).toBe('INCOME')
  })

  it('maps "asset" account_type to ASSET', () => {
    expect(transformAccount(makeAPAccount({ account_type: 'asset' })).type).toBe('ASSET')
  })

  it('maps "debtor" substring to ASSET', () => {
    expect(transformAccount(makeAPAccount({ account_type: 'Trade Debtors' })).type).toBe('ASSET')
  })

  it('maps "liabilit" substring to LIABILITY', () => {
    expect(transformAccount(makeAPAccount({ account_type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps "equity" to EQUITY', () => {
    expect(transformAccount(makeAPAccount({ account_type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps "expense" to EXPENSE', () => {
    expect(transformAccount(makeAPAccount({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps "overhead" substring to EXPENSE', () => {
    expect(transformAccount(makeAPAccount({ account_type: 'Overhead costs' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAPAccount({ account_type: 'weird_type' })).type).toBe('OTHER')
  })

  it('maps is_active to status ACTIVE / ARCHIVED', () => {
    expect(transformAccount(makeAPAccount({ is_active: true })).status).toBe('ACTIVE')
    expect(transformAccount(makeAPAccount({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('converts balance to minor units via toMinorUnits (Math.round * 100)', () => {
    const result = transformAccount(makeAPAccount({ balance: 1250.5 }))
    expect(result.balance).toBe(125050)
  })

  it('leaves balance undefined when null', () => {
    const result = transformAccount(makeAPAccount({ balance: null }))
    expect(result.balance).toBeUndefined()
  })

  it('maps currency', () => {
    expect(transformAccount(makeAPAccount({ currency: 'EUR' })).currency).toBe('EUR')
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeAPAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
