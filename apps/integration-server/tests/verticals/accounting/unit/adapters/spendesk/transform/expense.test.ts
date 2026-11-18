import { describe, it, expect } from 'vitest'
import {
  transformPayable,
  transformSearchPayable,
} from '../../../../../../../src/verticals/accounting/adapters/spendesk/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { payable, searchPayable } from '../fixtures'

describe('transformSearchPayable (spendesk, POST /v1/payables/search)', () => {
  const out = () => ExpenseSchema.parse(transformSearchPayable(searchPayable()))

  it('maps the documented example', () => {
    expect(out()).toMatchObject({
      id: 'bc9cef35-401d-4ea4-b384-ed725e6685cf',
      userId: 'usr_001',
      contactId: 'sup_xyz',
      currency: 'EUR',
      paymentMethod: 'invoice',
      totalAmount: 1500,
      postedAt: new Date('2024-06-15T10:30:00.000Z'),
      createdAt: new Date('2024-06-15T10:30:00.000Z'),
    })
  })

  // creationDate is the issue date and "does NOT reflect when the record entered
  // Spendesk (see firstCreatedAt for that)": the two must not be swapped.
  it('postedAt is creationDate and createdAt is firstCreatedAt', () => {
    const r = ExpenseSchema.parse(
      transformSearchPayable(
        searchPayable({
          creationDate: '2024-05-01T00:00:00.000Z',
          firstCreatedAt: '2024-06-15T10:30:00.000Z',
        }),
      ),
    )
    expect(r.postedAt).toEqual(new Date('2024-05-01T00:00:00.000Z'))
    expect(r.createdAt).toEqual(new Date('2024-06-15T10:30:00.000Z'))
  })

  it('maps itemLines to lines, amounts unchanged (already minor units)', () => {
    expect(out().lineItems).toEqual([{ taxAmount: 250, totalAmount: 1500 }])
  })

  it('reports no header tax (line VAT plus adjustment does not document a total)', () => {
    expect(out().taxAmount).toBeUndefined()
  })

  it('an employee counterparty is its memberId', () => {
    const raw = searchPayable({ counterparty: { type: 'employee', memberId: 'usr_777' } })
    expect(ExpenseSchema.parse(transformSearchPayable(raw)).contactId).toBe('usr_777')
  })

  it('accountId is the account every line posts to, and absent when lines disagree', () => {
    const line = searchPayable().itemLines[0]!
    const one = searchPayable({
      itemLines: [
        { ...line, expenseAccountId: 'acc_1' },
        { ...line, expenseAccountId: 'acc_1' },
      ],
    })
    const two = searchPayable({
      itemLines: [
        { ...line, expenseAccountId: 'acc_1' },
        { ...line, expenseAccountId: 'acc_2' },
      ],
    })
    expect(ExpenseSchema.parse(transformSearchPayable(one)).accountId).toBe('acc_1')
    expect(ExpenseSchema.parse(transformSearchPayable(two)).accountId).toBeUndefined()
    expect(
      ExpenseSchema.parse(transformSearchPayable(two)).lineItems?.map((l) => l.accountId),
    ).toEqual(['acc_1', 'acc_2'])
  })

  it('keeps a reversal’s negative amount', () => {
    const raw = searchPayable({ kind: 'reversal', type: 'reverseBill', amount: -1500 })
    expect(ExpenseSchema.parse(transformSearchPayable(raw)).totalAmount).toBe(-1500)
  })
})

describe('transformPayable (spendesk, GET /v1/payables/{id})', () => {
  const out = () => ExpenseSchema.parse(transformPayable(payable({ type: 'expenseClaim' })))

  it('maps the documented fields', () => {
    expect(out()).toMatchObject({
      id: 'bc9cef35-401d-4ea4-b384-ed725e6685cf',
      userId: 'usr_001',
      contactId: 'sup_xyz',
      accountId: 'acc_606',
      currency: 'EUR',
      paymentMethod: 'EXPENSE_CLAIM',
      totalAmount: 1500,
      postedAt: new Date('2024-06-15T00:00:00.000Z'),
      createdAt: new Date('2024-06-15T10:30:00.000Z'),
    })
  })

  it('maps lines from lineItems[].financial and expenseAccount', () => {
    expect(out().lineItems).toEqual([
      {
        accountId: 'acc_606',
        accountCode: '606000',
        taxAmount: 250,
        totalAmount: 1500,
        notes: 'Office supplies',
      },
    ])
  })

  it('reports no header tax from the first line alone', () => {
    expect(out().taxAmount).toBeUndefined()
  })

  it('maps multiUseCard to CARD', () => {
    expect(transformPayable(payable({ type: 'multiUseCard' })).paymentMethod).toBe('CARD')
  })

  it('omits lineItems when the payable has none', () => {
    expect(transformPayable(payable({ lineItems: [] })).lineItems).toBeUndefined()
  })
})
