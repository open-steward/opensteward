/** Saasu AccountDetail → Account, over the documented GET Accounts sample. */
import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount } from '../../../../../../../src/verticals/accounting/adapters/saasu/transform/account'
import { account } from '../fixtures'

describe('transformAccount (saasu)', () => {
  it('maps the documented fields', () => {
    const a = AccountSchema.parse(transformAccount(account()))
    expect(a).toMatchObject({
      id: '1',
      name: 'Test Income Account',
      customerDefinedCode: 'AA',
      status: 'ACTIVE',
      type: 'INCOME',
      parentId: '3',
      currency: 'AUD',
    })
  })

  it.each([
    ['Asset', 'ASSET'],
    ['Liability', 'LIABILITY'],
    ['Equity', 'EQUITY'],
    ['OtherIncome', 'INCOME'],
    ['Expense', 'EXPENSE'],
    ['OtherExpense', 'EXPENSE'],
    ['CostOfSales', 'EXPENSE'],
    ['Something', 'unknown'],
  ])('maps AccountType %s to %s', (type, expected) => {
    expect(AccountSchema.parse(transformAccount(account({ AccountType: type }))).type).toBe(
      expected,
    )
  })

  it('maps an inactive account to ARCHIVED', () => {
    expect(transformAccount(account({ IsActive: false })).status).toBe('ARCHIVED')
  })
})
