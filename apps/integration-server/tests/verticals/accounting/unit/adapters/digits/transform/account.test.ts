/**
 * Fixture: the two categories in the chart-of-accounts guide's list response,
 * verbatim (https://developer.digits.com/docs/chart-of-accounts.md), plus the
 * spec's createdAt/updatedAt on the first.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCategory,
  type DigitsCategory,
} from '../../../../../../../src/verticals/accounting/adapters/digits/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

const BANK: DigitsCategory = {
  id: '4765df8a-0f88-4838-8ba6-353285337995',
  name: 'Bank Accounts',
  type: 'Assets',
  subtype: 'BankAccounts',
  parentId: 'b5837139-426e-4625-804b-49da75a66382',
  displayNumber: '1100',
  active: true,
  createdAt: '2025-01-02T03:04:05Z',
  updatedAt: '2025-02-03T04:05:06Z',
}

const AP: DigitsCategory = {
  id: '7b43b647-97e4-4ecb-9117-c988e1ed001f',
  name: 'Accounts Payable',
  type: 'Liabilities',
  subtype: 'AccountsPayable',
  displayNumber: '2000',
  active: true,
}

describe('transformCategory (digits)', () => {
  it('maps the documented Category fields', () => {
    const out = AccountSchema.parse(transformCategory(BANK))
    expect(out.id).toBe('4765df8a-0f88-4838-8ba6-353285337995')
    expect(out.name).toBe('Bank Accounts')
    expect(out.customerDefinedCode).toBe('1100')
    expect(out.type).toBe('ASSET')
    expect(out.status).toBe('ACTIVE')
    expect(out.subgroup).toBe('BankAccounts')
    expect(out.parentId).toBe('b5837139-426e-4625-804b-49da75a66382')
    expect(out.createdAt).toEqual(new Date('2025-01-02T03:04:05Z'))
    expect(out.updatedAt).toEqual(new Date('2025-02-03T04:05:06Z'))
  })

  it('a category with no parent has no parentId', () => {
    const out = AccountSchema.parse(transformCategory(AP))
    expect(out.type).toBe('LIABILITY')
    expect(out.parentId).toBeUndefined()
  })

  it.each([
    ['Equity', 'EQUITY'],
    ['Income', 'INCOME'],
    ['OtherIncome', 'INCOME'],
    ['Expenses', 'EXPENSE'],
    ['CostOfGoodsSold', 'EXPENSE'],
    ['OtherExpenses', 'EXPENSE'],
    ['UnknownType', 'unknown'],
  ])('type %s → %s', (type, expected) => {
    expect(AccountSchema.parse(transformCategory({ ...AP, type })).type).toBe(expected)
  })

  it('active false → ARCHIVED; absent → no status', () => {
    expect(AccountSchema.parse(transformCategory({ ...AP, active: false })).status).toBe('ARCHIVED')
    const { active: _a, ...noActive } = AP
    expect(AccountSchema.parse(transformCategory(noActive)).status).toBeUndefined()
  })

  it('throws on a category with no id', () => {
    const { id: _id, ...noId } = AP
    expect(() => transformCategory(noId)).toThrow(/no id/)
  })
})
