import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type FreeAgentBill,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/bill'

function makeBill(overrides: Partial<FreeAgentBill> = {}): FreeAgentBill {
  return {
    url: 'https://api.freeagent.com/v2/bills/999',
    contact: 'https://api.freeagent.com/v2/contacts/42',
    reference: 'BILL-001',
    dated_on: '2024-03-01',
    payment_terms_in_days: 30,
    currency: 'GBP',
    net_value: '1000.00',
    total_value: '1200.00',
    paid_value: '0.00',
    due_value: '1200.00',
    status: 'Sent',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('extracts id from url', () => {
    expect(transformBill(makeBill()).id).toBe('999')
  })

  it('extracts contactId from contact url', () => {
    expect(transformBill(makeBill()).contactId).toBe('42')
  })

  it('maps currency correctly', () => {
    expect(transformBill(makeBill()).currency).toBe('GBP')
  })

  it('parses totalAmount from total_value', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1200)
  })

  it('parses balanceAmount from due_value', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(1200)
  })

  it('parses paidAmount from paid_value', () => {
    expect(transformBill(makeBill()).paidAmount).toBe(0)
  })

  it('parses dated_on as postedAt Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('computes dueAt from dated_on plus payment_terms_in_days', () => {
    const b = transformBill(makeBill())
    const expected = new Date(new Date('2024-03-01').getTime() + 30 * 86400 * 1000)
    expect(b.dueAt).toEqual(expected)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Scheduled status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'Scheduled' })).status).toBe('DRAFT')
  })

  it('maps Sent status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'Sent' })).status).toBe('AUTHORIZED')
  })

  it('maps Email Scheduled status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'Email Scheduled' })).status).toBe('AUTHORIZED')
  })

  it('maps Overdue status to OVERDUE', () => {
    expect(transformBill(makeBill({ status: 'Overdue' })).status).toBe('OVERDUE')
  })

  it('maps Partly Paid status to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'Partly Paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps Paid status to PAID', () => {
    expect(transformBill(makeBill({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Void status to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'Void' })).status).toBe('VOIDED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
