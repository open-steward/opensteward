import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type OdooAccount } from '../../../../../../../src/verticals/accounting/adapters/odoo/transform/account'

function makeAccount(overrides: Partial<OdooAccount> = {}): OdooAccount {
  return {
    id: 1,
    code: '1000',
    name: 'Cash',
    account_type: 'asset_cash',
    deprecated: false,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1')
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.name).toBe('Cash')
  })

  it('maps account_type starting with asset to ASSET', () => {
    expect(transformAccount(makeAccount({ account_type: 'asset_cash' })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ account_type: 'asset_receivable' })).type).toBe('ASSET')
  })

  it('maps account_type starting with liability to LIABILITY', () => {
    expect(transformAccount(makeAccount({ account_type: 'liability_payable' })).type).toBe('LIABILITY')
  })

  it('maps account_type starting with equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ account_type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps account_type starting with income to INCOME', () => {
    expect(transformAccount(makeAccount({ account_type: 'income' })).type).toBe('INCOME')
  })

  it('maps account_type starting with expense to EXPENSE', () => {
    expect(transformAccount(makeAccount({ account_type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown account_type to OTHER', () => {
    expect(transformAccount(makeAccount({ account_type: 'off_balance' })).type).toBe('OTHER')
  })

  it('maps deprecated=false to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ deprecated: false })).status).toBe('ACTIVE')
  })

  it('maps deprecated=true to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ deprecated: true })).status).toBe('ARCHIVED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount({ code: '9999' })
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['code']).toBe('9999')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
