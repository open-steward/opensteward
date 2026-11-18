import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/bill'
import type { MorningDocument } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/invoice'

function makeDocument(overrides: Partial<MorningDocument> = {}): MorningDocument {
  return {
    id: 'bill_001',
    type: 400,
    status: 1,
    number: 'BILL-001',
    sum: 2000,
    vat: 340,
    currency: 'ILS',
    date: '2024-03-01',
    dueDate: '2024-03-31',
    client: { id: 'supplier_1' },
    ...overrides,
  }
}

describe('transformBill (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeDocument())
    expect(result.id).toBe('bill_001')
    expect(result.billNumber).toBe('BILL-001')
    expect(result.contactId).toBe('supplier_1')
    expect(result.totalAmount).toBe(2000)
    expect(result.taxAmount).toBe(340)
    expect(result.currency).toBe('ILS')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeDocument())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDocument()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status 0 to DRAFT', () => {
    const result = transformBill(makeDocument({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 2 to PAID', () => {
    const result = transformBill(makeDocument({ status: 2 }))
    expect(result.status).toBe('PAID')
  })

  it('maps status -1 to VOIDED', () => {
    const result = transformBill(makeDocument({ status: -1 }))
    expect(result.status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeDocument())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
