import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type InvoiceqAccount } from '../../../../../../../src/verticals/accounting/adapters/invoiceq/transform/account'

function makeRaw(overrides: Partial<InvoiceqAccount> = {}): InvoiceqAccount {
  return {
    id: 'acc1',
    account_code: '5000',
    account_name: 'Cost of Sales',
    account_type: 'expense',
    is_active: true,
    ...overrides,
  }
}

describe('transformAccount (invoiceq)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('acc1')
    expect(result.name).toBe('Cost of Sales')
    expect(result.customerDefinedCode).toBe('5000')
    expect(result.type).toBe('EXPENSE')
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps income type to INCOME', () => {
    expect(transformAccount(makeRaw({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps revenue type to INCOME', () => {
    expect(transformAccount(makeRaw({ account_type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeRaw({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeRaw({ account_type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type to LIABILITY', () => {
    expect(transformAccount(makeRaw({ account_type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type to EQUITY', () => {
    expect(transformAccount(makeRaw({ account_type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeRaw({ account_type: 'misc' })).type).toBe('OTHER')
  })

  it('is case-insensitive for account type mapping', () => {
    expect(transformAccount(makeRaw({ account_type: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('maps is_active=false to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps is_active=true to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ is_active: true })).status).toBe('ACTIVE')
  })

  it('defaults to ACTIVE when is_active is undefined', () => {
    const raw = makeRaw()
    delete raw.is_active
    expect(transformAccount(raw).status).toBe('ACTIVE')
  })

  it('returns undefined type when account_type is not set', () => {
    expect(transformAccount(makeRaw({ account_type: undefined })).type).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
