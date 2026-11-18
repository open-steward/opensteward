import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type FireflyAccountResource,
} from '../../../../../../../src/verticals/accounting/adapters/firefly-iii/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(
  overrides: Partial<FireflyAccountResource['attributes']> = {},
): FireflyAccountResource {
  return {
    type: 'accounts',
    id: '42',
    attributes: {
      created_at: '2024-03-01T10:00:00.000Z',
      updated_at: '2024-06-15T12:00:00.000Z',
      active: true,
      order: 1,
      name: 'Main Checking',
      type: 'asset',
      account_role: 'defaultAsset',
      currency_id: '1',
      currency_code: 'USD',
      currency_name: 'US Dollar',
      current_balance: '1250.00',
      current_balance_date: '2024-06-15',
      iban: 'US00123456789',
      bic: null,
      account_number: 'ACC-001',
      opening_balance: '0',
      opening_balance_date: null,
      virtual_balance: '0',
      include_net_worth: true,
      notes: 'Primary operating account',
      object_group_title: null,
      ...overrides,
    },
  }
}

describe('transformAccount (firefly-iii)', () => {
  it('maps id from resource id', () => {
    expect(transformAccount(makeAccount()).id).toBe('42')
  })

  it('maps name from attributes.name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Main Checking')
  })

  it('maps active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ active: true })).status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps cash type to ASSET', () => {
    expect(transformAccount(makeAccount({ type: 'cash' })).type).toBe('ASSET')
  })

  it('maps liability type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps revenue type to INCOME', () => {
    expect(transformAccount(makeAccount({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps reconciliation type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'reconciliation' })).type).toBe('OTHER')
  })

  it('converts decimal current_balance to minor units', () => {
    // '1250.00' → 125000
    expect(transformAccount(makeAccount({ current_balance: '1250.00' })).balance).toBe(125000)
  })

  it('prefers account_number over iban for customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('ACC-001')
  })

  it('falls back to iban when account_number is null', () => {
    const result = transformAccount(makeAccount({ account_number: null, iban: 'US00123456789' }))
    expect(result.customerDefinedCode).toBe('US00123456789')
  })

  it('maps currency from currency_code', () => {
    expect(transformAccount(makeAccount()).currency).toBe('USD')
  })

  it('maps description from notes', () => {
    expect(transformAccount(makeAccount()).description).toBe('Primary operating account')
  })

  it('maps created_at and updated_at as Date objects', () => {
    const result = transformAccount(makeAccount())
    expect(result.createdAt).toEqual(new Date('2024-03-01T10:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-15T12:00:00.000Z'))
  })

  it('produces a schema-valid Account', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
