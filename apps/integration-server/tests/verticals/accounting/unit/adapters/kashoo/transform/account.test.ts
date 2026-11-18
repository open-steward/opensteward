import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type KashooAccount,
} from '../../../../../../../src/verticals/accounting/adapters/kashoo/transform/account'

function makeAccount(overrides: Partial<KashooAccount> = {}): KashooAccount {
  return {
    id: 'acc-001',
    name: 'Sales Revenue',
    description: 'Revenue from sales',
    code: '4000',
    type: 'income',
    is_archived: false,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id from raw id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acc-001')
  })

  it('maps name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Revenue from sales')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps is_archived=false to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ is_archived: false })).status).toBe('ACTIVE')
  })

  it('maps is_archived=true to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ is_archived: true })).status).toBe('ARCHIVED')
  })

  it('maps type containing "asset" to ASSET type', () => {
    expect(transformAccount(makeAccount({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps type containing "liabilit" to LIABILITY type', () => {
    expect(transformAccount(makeAccount({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps type containing "equity" to EQUITY type', () => {
    expect(transformAccount(makeAccount({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps type containing "income" to INCOME type', () => {
    expect(transformAccount(makeAccount({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps type containing "revenue" to INCOME type', () => {
    expect(transformAccount(makeAccount({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps type containing "expense" to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'other' })).type).toBe('OTHER')
  })

  it('returns undefined name when name is empty', () => {
    expect(transformAccount(makeAccount({ name: '' })).name).toBeUndefined()
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
