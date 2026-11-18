import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type KlaraAccount,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<KlaraAccount> = {}): KlaraAccount {
  return {
    id: 'acct-1',
    account_number: '1000',
    name: 'Cash',
    description: 'Main cash account',
    account_type: 'asset',
    is_active: true,
    balance: 250000,
    currency: 'CHF',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acct-1')
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.name).toBe('Cash')
    expect(result.description).toBe('Main cash account')
    expect(result.balance).toBe(250000)
    expect(result.currency).toBe('CHF')
  })

  it('maps account_type asset to ASSET', () => {
    expect(transformAccount(makeAccount({ account_type: 'asset' })).type).toBe('ASSET')
  })

  it('maps account_type liability to LIABILITY', () => {
    expect(transformAccount(makeAccount({ account_type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps account_type equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ account_type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps account_type income to INCOME', () => {
    expect(transformAccount(makeAccount({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps account_type expense to EXPENSE', () => {
    expect(transformAccount(makeAccount({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown account_type to OTHER', () => {
    expect(transformAccount(makeAccount({ account_type: 'other' })).type).toBe('OTHER')
  })

  it('maps is_active=true to ACTIVE', () => {
    expect(transformAccount(makeAccount({ is_active: true })).status).toBe('ACTIVE')
  })

  it('maps is_active=false to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('parses createdAt and updatedAt as Date objects', () => {
    const result = transformAccount(makeAccount())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes raw object through as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('maps parent_id to parentId', () => {
    expect(transformAccount(makeAccount({ parent_id: 'acct-0' })).parentId).toBe('acct-0')
  })

  it('passes schema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
