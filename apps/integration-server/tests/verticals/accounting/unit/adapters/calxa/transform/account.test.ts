import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type CalxaAccount,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<CalxaAccount> = {}): CalxaAccount {
  return {
    id: 'acct-001',
    name: 'Sales Revenue',
    code: '4000',
    type: 'Revenue',
    isActive: true,
    currency: 'USD',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id as-is', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct-001')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('USD')
  })

  it('maps isActive=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ isActive: true })).status).toBe('ACTIVE')
  })

  it('maps isActive=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ isActive: false })).status).toBe('ARCHIVED')
  })

  it('maps isActive=undefined to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ isActive: undefined })).status).toBe('ACTIVE')
  })

  it('maps type containing ASSET to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'Fixed Asset' })).type).toBe('ASSET')
  })

  it('maps type containing BANK to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'Bank' })).type).toBe('ASSET')
  })

  it('maps type containing CURRENT to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'Current Asset' })).type).toBe('ASSET')
  })

  it('maps type containing LIAB to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'Liability' })).type).toBe('LIABILITY')
  })

  it('maps type containing CREDIT to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'Credit Card' })).type).toBe('LIABILITY')
  })

  it('maps type containing EQUITY to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps type containing OWNER to EQUITY', () => {
    expect(transformAccount(makeAccount({ type: "Owner's Equity" })).type).toBe('EQUITY')
  })

  it('maps type containing REVENUE to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'Revenue' })).type).toBe('INCOME')
  })

  it('maps type containing INCOME to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'Other Income' })).type).toBe('INCOME')
  })

  it('maps type containing SALES to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'Sales' })).type).toBe('INCOME')
  })

  it('maps type containing EXPENSE to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'Expense' })).type).toBe('EXPENSE')
  })

  it('maps type containing COST to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'Cost of Goods Sold' })).type).toBe('EXPENSE')
  })

  it('maps type containing OVERHEAD to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'Overhead' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'Miscellaneous' })).type).toBe('OTHER')
  })

  it('returns undefined type when type is undefined', () => {
    expect(transformAccount(makeAccount({ type: undefined })).type).toBeUndefined()
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount({ description: 'Main revenue account' })).description).toBe(
      'Main revenue account',
    )
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount({ balance: 1500 })).balance).toBe(1500)
  })

  it('maps createdAt to Date', () => {
    const result = transformAccount(makeAccount({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformAccount(makeAccount({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
