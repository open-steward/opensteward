import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type PEAccountingAccount,
} from '../../../../../../../src/verticals/accounting/adapters/peaccounting/transform/account'

function makeAccount(overrides: Partial<PEAccountingAccount> = {}): PEAccountingAccount {
  return {
    id: 1001,
    number: '3000',
    name: 'Sales Revenue',
    type: 'income',
    active: true,
    ...overrides,
  }
}

describe('transformAccount (PE Accounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1001')
    expect(result.name).toBe('Sales Revenue')
    expect(result.customerDefinedCode).toBe('3000')
    expect(result.type).toBe('INCOME')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps active false to ARCHIVED status', () => {
    const result = transformAccount(makeAccount({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps active true to ACTIVE status', () => {
    const result = transformAccount(makeAccount({ active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('defaults to ACTIVE when active is not set', () => {
    const raw = makeAccount()
    delete raw.active
    const result = transformAccount(raw)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps asset type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps expense type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'unknown_type' })).type).toBe('OTHER')
  })

  it('returns undefined type when type is not set', () => {
    const raw = makeAccount()
    delete raw.type
    expect(transformAccount(raw).type).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
