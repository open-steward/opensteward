import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type WfirmaExpense,
} from '../../../../../../../src/verticals/accounting/adapters/wfirma/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeExpense(overrides: Partial<WfirmaExpense> = {}): WfirmaExpense {
  return {
    id: 200,
    number: 'KUP/1/2024',
    date: '2024-05-10',
    paymentdate: '2024-06-10',
    paymentstate: 'unpaid',
    paymentmethod: 'transfer',
    netto: '500.00',
    brutto: '615.00',
    tax: '115.00',
    paid: '0.00',
    remaining: '615.00',
    currency: 'PLN',
    description: 'Supplier invoice for services',
    contractor_id: 88,
    created: '2024-05-09T00:00:00.000Z',
    modified: '2024-05-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeExpense())
    expect(result.id).toBe('200')
    expect(result.billNumber).toBe('KUP/1/2024')
    expect(result.contactId).toBe('88')
    expect(result.currency).toBe('PLN')
    expect(result.notes).toBe('Supplier invoice for services')
  })

  it('converts brutto to totalAmount in minor units', () => {
    const result = transformBill(makeExpense({ brutto: '615.00' }))
    expect(result.totalAmount).toBe(61500)
  })

  it('converts tax to taxAmount in minor units', () => {
    const result = transformBill(makeExpense({ tax: '115.00' }))
    expect(result.taxAmount).toBe(11500)
  })

  it('maps paymentstate unpaid to AUTHORIZED', () => {
    const result = transformBill(makeExpense({ paymentstate: 'unpaid' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paymentstate paid to PAID', () => {
    const result = transformBill(makeExpense({ paymentstate: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('defaults to DRAFT for other paymentstate', () => {
    const result = transformBill(makeExpense({ paymentstate: 'undefined' }))
    expect(result.status).toBe('DRAFT')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeExpense())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(result.createdAt).toEqual(new Date('2024-05-09T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makeExpense()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformBill(makeExpense())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
