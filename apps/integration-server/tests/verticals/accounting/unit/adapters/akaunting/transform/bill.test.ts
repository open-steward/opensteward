import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type AkauntingBill,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/bill'

function makeBill(overrides: Partial<AkauntingBill> = {}): AkauntingBill {
  return {
    id: 201,
    document_number: 'BILL-001',
    contact_id: 55,
    contact_name: 'Supplier Co',
    currency_code: 'EUR',
    issued_at: '2024-02-01',
    due_at: '2024-03-01',
    status: 'received',
    amount: 5000,
    tax_total: 1000,
    paid: 0,
    category_id: 8,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id as string', () => {
    expect(transformBill(makeBill()).id).toBe('201')
  })

  it('maps document_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps contact_id to contactId as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('55')
  })

  it('maps currency_code to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(5000)
    expect(b.taxAmount).toBe(1000)
    expect(b.balanceAmount).toBe(5000)
  })

  it('maps issued_at to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps due_at to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when issued_at is empty', () => {
    expect(transformBill(makeBill({ issued_at: '' })).postedAt).toBeUndefined()
  })

  it('maps status draft to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status received to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'received' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'cancelled' })).status).toBe('VOIDED')
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
