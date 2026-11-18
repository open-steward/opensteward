import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type AccurateBill } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/bill'

function makeBill(overrides: Partial<AccurateBill> = {}): AccurateBill {
  return {
    id: 4001,
    number: 'PI/2024/001',
    status: 'Open',
    transactionDate: '2024-05-01',
    dueDate: '2024-05-31',
    totalAmount: 8800000,
    taxAmount: 800000,
    currencyCode: 'IDR',
    customerNo: 'V-001',
    detailItem: [],
    ...overrides,
  }
}

describe('transformBill (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('4001')
    expect(result.billNumber).toBe('PI/2024/001')
    expect(result.contactId).toBe('V-001')
    expect(result.totalAmount).toBe(8800000)
    expect(result.taxAmount).toBe(800000)
    expect(result.currency).toBe('IDR')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
    expect(result.dueAt).toEqual(new Date('2024-05-31'))
  })

  it('maps Open to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('maps Closed to PAID', () => {
    expect(transformBill(makeBill({ status: 'Closed' })).status).toBe('PAID')
  })

  it('maps Voided to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
