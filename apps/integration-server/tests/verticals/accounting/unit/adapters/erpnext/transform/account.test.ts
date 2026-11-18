import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ErpNextAccount } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/account'

function makeRaw(overrides: Partial<ErpNextAccount> = {}): ErpNextAccount {
  return {
    name: '1100 - Cash - ACME',
    account_name: 'Cash',
    account_number: '1100',
    account_type: 'Asset',
    disabled: 0,
    ...overrides,
  }
}

describe('transformAccount (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('1100 - Cash - ACME')
    expect(result.name).toBe('Cash')
    expect(result.customerDefinedCode).toBe('1100')
    expect(result.status).toBe('ACTIVE')
    expect(result.type).toBe('ASSET')
  })

  it('maps Liability type', () => {
    expect(transformAccount(makeRaw({ account_type: 'Liability' })).type).toBe('LIABILITY')
  })

  it('maps Equity type', () => {
    expect(transformAccount(makeRaw({ account_type: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps Income type', () => {
    expect(transformAccount(makeRaw({ account_type: 'Income' })).type).toBe('INCOME')
  })

  it('maps Expense type', () => {
    expect(transformAccount(makeRaw({ account_type: 'Expense' })).type).toBe('EXPENSE')
  })

  it('maps disabled account to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ disabled: 1 })).status).toBe('ARCHIVED')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
