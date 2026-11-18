import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type FacturamaBill } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/bill'

function makeRaw(overrides: Partial<FacturamaBill> = {}): FacturamaBill {
  return {
    Id: 'bill-1',
    Folio: 'B-001',
    SupplierId: 'supp-1',
    Currency: 'MXN',
    Total: 1160,
    TaxAmount: 160,
    Balance: 1160,
    Date: '2024-01-10',
    DueDate: '2024-02-10',
    Status: 'pending',
    IsCancelled: false,
    ...overrides,
  }
}

describe('facturama transformBill', () => {
  it('maps Id to id', () => {
    expect(transformBill(makeRaw()).id).toBe('bill-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformBill(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })
  it('maps IsCancelled true -> VOIDED', () => {
    expect(transformBill(makeRaw({ IsCancelled: true })).status).toBe('VOIDED')
  })
  it('maps Balance=0 -> PAID', () => {
    expect(transformBill(makeRaw({ Balance: 0 })).status).toBe('PAID')
  })
  it('maps Date to postedAt as Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-01-10'))
  })
  it('maps DueDate to dueAt as Date', () => {
    expect(transformBill(makeRaw()).dueAt).toEqual(new Date('2024-02-10'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
