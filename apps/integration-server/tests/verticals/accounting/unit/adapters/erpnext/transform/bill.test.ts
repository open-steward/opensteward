import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ErpNextBill } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/bill'

function makeRaw(overrides: Partial<ErpNextBill> = {}): ErpNextBill {
  return {
    name: 'PINV-2024-00001',
    posting_date: '2024-01-20',
    due_date: '2024-02-20',
    base_grand_total: 960,
    base_total_taxes_and_charges: 160,
    outstanding_amount: 960,
    status: 'Submitted',
    currency: 'USD',
    supplier: 'Supplier Ltd',
    remarks: 'Test bill',
    items: [],
    ...overrides,
  }
}

describe('transformBill (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('PINV-2024-00001')
    expect(result.billNumber).toBe('PINV-2024-00001')
    expect(result.contactId).toBe('Supplier Ltd')
    expect(result.totalAmount).toBe(960)
    expect(result.taxAmount).toBe(160)
    expect(result.balanceAmount).toBe(960)
    expect(result.currency).toBe('USD')
  })

  it('maps status Draft to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps status Paid to PAID', () => {
    expect(transformBill(makeRaw({ status: 'Paid' })).status).toBe('PAID')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-20'))
    expect(result.dueAt).toEqual(new Date('2024-02-20'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
