import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type PandleAccount,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/account'

function makeAccount(overrides: Partial<PandleAccount> = {}): PandleAccount {
  return {
    id: 4000,
    name: 'Sales Revenue',
    description: 'Revenue from sales',
    nominal_code: '4000',
    category: 'sales',
    is_locked: false,
    is_visible: true,
    currency: 'GBP',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id from raw id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('4000')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Revenue from sales')
  })

  it('maps nominal_code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('GBP')
  })

  it('maps is_visible=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ is_visible: true })).status).toBe('ACTIVE')
  })

  it('maps is_visible=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ is_visible: false })).status).toBe('ARCHIVED')
  })

  it('maps category containing "sales" to INCOME type', () => {
    expect(transformAccount(makeAccount({ category: 'sales' })).type).toBe('INCOME')
  })

  it('maps category containing "income" to INCOME type', () => {
    expect(transformAccount(makeAccount({ category: 'income' })).type).toBe('INCOME')
  })

  it('maps category containing "asset" to ASSET type', () => {
    expect(transformAccount(makeAccount({ category: 'fixed_asset' })).type).toBe('ASSET')
  })

  it('maps category containing "bank" to ASSET type', () => {
    expect(transformAccount(makeAccount({ category: 'bank' })).type).toBe('ASSET')
  })

  it('maps category containing "liabilit" to LIABILITY type', () => {
    expect(transformAccount(makeAccount({ category: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps category containing "equity" to EQUITY type', () => {
    expect(transformAccount(makeAccount({ category: 'equity' })).type).toBe('EQUITY')
  })

  it('maps category containing "expense" to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ category: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps category containing "cost" to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ category: 'cost_of_sales' })).type).toBe('EXPENSE')
  })

  it('maps unknown category to OTHER type', () => {
    expect(transformAccount(makeAccount({ category: 'other' })).type).toBe('OTHER')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
