import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type MaxioBill } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/bill'

function makeBill(overrides: Partial<MaxioBill> = {}): MaxioBill {
  return {
    uid: 'bill_XYZ456',
    number: 'BILL-001',
    state: 'open',
    created_at: '2024-03-01T00:00:00Z',
    due_date: '2024-04-01',
    currency: 'USD',
    total_amount: '800.00',
    tax_amount: '80.00',
    paid_amount: '0.00',
    due_amount: '800.00',
    vendor_id: 7,
    line_items: [],
    ...overrides,
  }
}

describe('transformBill (Maxio)', () => {
  it('maps id from uid', () => {
    expect(transformBill(makeBill()).id).toBe('bill_XYZ456')
  })

  it('maps billNumber from number', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps contacts from vendor_id as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('7')
  })

  it('maps totalAmount from total_amount string', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(800)
  })

  it('maps taxAmount from tax_amount string', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(80)
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01T00:00:00Z'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('maps draft state to DRAFT', () => {
    expect(transformBill(makeBill({ state: 'draft' })).status).toBe('DRAFT')
  })

  it('maps open state to AUTHORIZED', () => {
    expect(transformBill(makeBill({ state: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps paid state to PAID', () => {
    expect(transformBill(makeBill({ state: 'paid' })).status).toBe('PAID')
  })

  it('maps voided state to VOIDED', () => {
    expect(transformBill(makeBill({ state: 'voided' })).status).toBe('VOIDED')
  })

  it('maps canceled state to VOIDED', () => {
    expect(transformBill(makeBill({ state: 'canceled' })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
