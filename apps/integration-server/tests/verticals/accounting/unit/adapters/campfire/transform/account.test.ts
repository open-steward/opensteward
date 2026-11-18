import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type CampfireChartAccount,
} from '../../../../../../../src/verticals/accounting/adapters/campfire/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<CampfireChartAccount> = {}): CampfireChartAccount {
  return {
    id: 42,
    name: 'Sales Revenue',
    number: '4000',
    account_type: 'REVENUE',
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id to string when account_id is absent', () => {
    expect(transformAccount(makeAccount()).id).toBe('42')
  })

  it('prefers account_id over numeric id', () => {
    expect(transformAccount(makeAccount({ account_id: 'acct-abc' })).id).toBe('acct-abc')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('USD')
  })

  it('maps INACTIVE status to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ status: 'INACTIVE' })).status).toBe('ARCHIVED')
  })

  it('maps non-INACTIVE status to ACTIVE', () => {
    expect(transformAccount(makeAccount({ status: 'ACTIVE' })).status).toBe('ACTIVE')
    expect(transformAccount(makeAccount({ status: null })).status).toBe('ACTIVE')
  })

  it('maps REVENUE account_type to INCOME', () => {
    expect(transformAccount(makeAccount({ account_type: 'REVENUE' })).type).toBe('INCOME')
  })

  it('maps ASSET account_type', () => {
    expect(transformAccount(makeAccount({ account_type: 'ASSET' })).type).toBe('ASSET')
  })

  it('maps LIABILITY account_type', () => {
    expect(transformAccount(makeAccount({ account_type: 'LIABILITY' })).type).toBe('LIABILITY')
  })

  it('maps EQUITY account_type', () => {
    expect(transformAccount(makeAccount({ account_type: 'EQUITY' })).type).toBe('EQUITY')
  })

  it('maps COGS account_type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ account_type: 'COGS' })).type).toBe('EXPENSE')
  })

  it('maps OPERATING_EXPENSES account_type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ account_type: 'OPERATING_EXPENSES' })).type).toBe(
      'EXPENSE',
    )
  })

  it('maps OTHER_INCOME account_type to INCOME', () => {
    expect(transformAccount(makeAccount({ account_type: 'OTHER_INCOME' })).type).toBe('INCOME')
  })

  it('returns undefined type for unknown account_type', () => {
    expect(transformAccount(makeAccount({ account_type: 'UNKNOWN_TYPE' })).type).toBeUndefined()
  })

  it('maps current_balance to balance', () => {
    expect(transformAccount(makeAccount({ current_balance: 1500 })).balance).toBe(1500)
  })

  it('maps parent to parentId as string', () => {
    expect(transformAccount(makeAccount({ parent: 10 })).parentId).toBe('10')
  })

  it('maps created_at to createdAt Date', () => {
    const result = transformAccount(makeAccount({ created_at: '2024-01-15T00:00:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T00:00:00Z'))
  })

  it('maps last_modified_at to updatedAt Date', () => {
    const result = transformAccount(makeAccount({ last_modified_at: '2024-02-01T00:00:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T00:00:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
