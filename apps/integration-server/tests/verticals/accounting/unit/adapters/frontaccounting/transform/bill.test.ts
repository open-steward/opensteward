import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type FABill } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/bill'

function makeRaw(overrides: Partial<FABill> = {}): FABill {
  return {
    id: 50,
    reference: 'BILL-2024-001',
    supp_reference: 'SUPP-REF-001',
    tran_date: '2024-01-20',
    due_date: '2024-02-20',
    supplier_id: 3,
    curr_code: 'USD',
    total: 960,
    tax_total: 160,
    balance: 960,
    status: 1,
    lines: [],
    ...overrides,
  }
}

describe('transformBill (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('50')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('3')
    expect(result.totalAmount).toBe(960)
    expect(result.taxAmount).toBe(160)
    expect(result.currency).toBe('USD')
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to SUBMITTED', () => {
    expect(transformBill(makeRaw({ status: 1 })).status).toBe('SUBMITTED')
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
