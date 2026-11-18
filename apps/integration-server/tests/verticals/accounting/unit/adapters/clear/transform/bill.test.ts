import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type ClearBill,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/bill'

function makeRaw(overrides: Partial<ClearBill> = {}): ClearBill {
  return {
    id: 'bill-uuid-001',
    bill_number: 'BILL/2024/001',
    bill_date: '2024-03-01',
    due_date: '2024-03-31',
    total_taxable_value: 5000,
    total_tax_amount: 900,
    grand_total: 5900,
    balance_amount: 5900,
    currency: 'INR',
    supplier_id: 'sup-uuid-001',
    supplier_name: 'Vendor Pvt Ltd',
    gstin_supplier: '29ABCDE1234F1Z5',
    status: 'pending',
    line_items: [],
    ...overrides,
  }
}

describe('transformBill (clear)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('bill-uuid-001')
    expect(result.billNumber).toBe('BILL/2024/001')
    expect(result.contactId).toBe('sup-uuid-001')
    expect(result.currency).toBe('INR')
    expect(result.totalAmount).toBe(5900)
    expect(result.taxAmount).toBe(900)
    expect(result.balanceAmount).toBe(5900)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformBill(makeRaw({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps paid status to PAID', () => {
    const result = transformBill(makeRaw({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformBill(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
