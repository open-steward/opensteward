import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type RampReimbursement,
} from '../../../../../../../src/verticals/accounting/adapters/ramp/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<RampReimbursement> = {}): RampReimbursement {
  return {
    id: 'reimb_uuid_001',
    amount: { amount: 12500, currency_code: 'USD' },
    merchant_name: 'Delta Airlines',
    transaction_date: '2024-03-05',
    memo: 'Flight to NYC conference',
    reimbursement_status: 'APPROVED',
    user: { id: 'user_abc', first_name: 'Alice', last_name: 'Wong', email: 'alice@co.com' },
    payment: {
      id: 'pay_001',
      payment_date: '2024-03-12',
      amount: { amount: 12500, currency_code: 'USD' },
    },
    accounting: { gl_account_id: 'gl_6100' },
    created_at: '2024-03-05T12:00:00Z',
    updated_at: '2024-03-12T09:00:00Z',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps id', () => {
    expect(transformExpense(makeExpense()).id).toBe('reimb_uuid_001')
  })

  it('maps merchant_name to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Delta Airlines')
  })

  it('maps accounting.gl_account_id to accountId', () => {
    expect(transformExpense(makeExpense()).accountId).toBe('gl_6100')
  })

  it('maps user.id to userId', () => {
    expect(transformExpense(makeExpense()).userId).toBe('user_abc')
  })

  it('maps amount.currency_code to currency', () => {
    expect(transformExpense(makeExpense()).currency).toBe('USD')
  })

  it('always sets paymentMethod to CARD', () => {
    expect(transformExpense(makeExpense()).paymentMethod).toBe('CARD')
  })

  it('maps amount.amount to totalAmount without conversion (already minor units)', () => {
    expect(transformExpense(makeExpense()).totalAmount).toBe(12500)
  })

  it('maps payment.amount.amount to reimbursedAmount', () => {
    expect(transformExpense(makeExpense()).reimbursedAmount).toBe(12500)
  })

  it('maps transaction_date to postedAt as Date', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-03-05'))
  })

  it('maps payment.payment_date to reimbursedAt as Date', () => {
    expect(transformExpense(makeExpense()).reimbursedAt).toEqual(new Date('2024-03-12'))
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformExpense(makeExpense()).createdAt).toEqual(new Date('2024-03-05T12:00:00Z'))
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformExpense(makeExpense()).updatedAt).toEqual(new Date('2024-03-12T09:00:00Z'))
  })

  it('accountId is undefined when accounting is absent', () => {
    expect(transformExpense(makeExpense({ accounting: undefined })).accountId).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeExpense()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces output that passes ExpenseSchema validation', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeExpense()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformExpense({
      id: 'reimb_001',
      amount: { amount: 0, currency_code: 'USD' },
    })
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
