import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type BillyAccount,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/account'

function makeAccount(overrides: Partial<BillyAccount> = {}): BillyAccount {
  return {
    id: 'acc-001',
    name: 'Sales Revenue',
    description: 'Revenue from sales',
    accountNo: 3000,
    groupId: 'group-revenue',
    natureId: 'revenue',
    isArchived: false,
    isBankAccount: false,
    isPaymentEnabled: false,
    currencyId: 'DKK',
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

  it('maps accountNo to customerDefinedCode as string', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('3000')
  })

  it('maps groupId to group', () => {
    expect(transformAccount(makeAccount()).group).toBe('group-revenue')
  })

  it('maps currencyId to currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('DKK')
  })

  it('maps isArchived=false to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ isArchived: false })).status).toBe('ACTIVE')
  })

  it('maps isArchived=true to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ isArchived: true })).status).toBe('ARCHIVED')
  })

  it('maps isBankAccount=true to ASSET type', () => {
    expect(transformAccount(makeAccount({ isBankAccount: true })).type).toBe('ASSET')
  })

  it('maps natureId containing "revenue" to INCOME type', () => {
    expect(transformAccount(makeAccount({ natureId: 'revenue' })).type).toBe('INCOME')
  })

  it('maps natureId containing "income" to INCOME type', () => {
    expect(transformAccount(makeAccount({ natureId: 'income' })).type).toBe('INCOME')
  })

  it('maps natureId containing "asset" to ASSET type', () => {
    expect(transformAccount(makeAccount({ natureId: 'asset', isBankAccount: false })).type).toBe('ASSET')
  })

  it('maps natureId containing "liabilit" to LIABILITY type', () => {
    expect(transformAccount(makeAccount({ natureId: 'liability', isBankAccount: false })).type).toBe('LIABILITY')
  })

  it('maps natureId containing "equity" to EQUITY type', () => {
    expect(transformAccount(makeAccount({ natureId: 'equity', isBankAccount: false })).type).toBe('EQUITY')
  })

  it('maps natureId containing "expense" to EXPENSE type', () => {
    expect(transformAccount(makeAccount({ natureId: 'expense', isBankAccount: false })).type).toBe('EXPENSE')
  })

  it('maps unknown natureId to OTHER type', () => {
    expect(transformAccount(makeAccount({ natureId: 'other', isBankAccount: false })).type).toBe('OTHER')
  })

  it('maps isPaymentEnabled to isPayable', () => {
    expect(transformAccount(makeAccount({ isPaymentEnabled: true })).isPayable).toBe(true)
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
