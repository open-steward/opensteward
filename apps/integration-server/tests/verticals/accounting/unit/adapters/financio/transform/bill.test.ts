import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type FinancioBill } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/bill'

function makeRaw(overrides: Partial<FinancioBill> = {}): FinancioBill {
  return {
    id: '300',
    bill_no: 'BILL-001',
    bill_date: '2024-02-01',
    due_date: '2024-02-28',
    sub_total: 800,
    tax_total: 48,
    grand_total: 848,
    outstanding: 848,
    currency_code: 'SGD',
    supplier_id: '20',
    supplier_name: 'Vendor Pte Ltd',
    status: 0,
    items: [],
    ...overrides,
  }
}

describe('transformBill (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('300')
    expect(result.billNumber).toBe('BILL-001')
    expect(result.contactId).toBe('20')
    expect(result.totalAmount).toBe(848)
    expect(result.taxAmount).toBe(48)
    expect(result.balanceAmount).toBe(848)
    expect(result.currency).toBe('SGD')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
    expect(result.dueAt).toEqual(new Date('2024-02-28'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ bill_no: 'BILL-SPECIAL' })
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['bill_no']).toBe('BILL-SPECIAL')
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    expect(transformBill(makeRaw({ status: 2 })).status).toBe('PAID')
  })

  it('maps status 3 to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 3 })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
