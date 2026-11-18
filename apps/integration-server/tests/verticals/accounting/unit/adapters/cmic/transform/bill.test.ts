import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type CmicBill } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/bill'

function makeBill(overrides: Partial<CmicBill> = {}): CmicBill {
  return {
    InvoiceId: 'BILL-001',
    InvoiceNumber: 'SI-2024-001',
    Status: 'Draft',
    VendorId: 'VND-789',
    ProjectCode: 'PRJ-001',
    Currency: 'USD',
    Amount: 8000,
    TaxAmount: 800,
    InvoiceDate: '2024-03-05',
    DueDate: '2024-04-05',
    Lines: [],
    ...overrides,
  }
}

describe('transformBill (CMiC)', () => {
  it('maps id from InvoiceId', () => {
    expect(transformBill(makeBill()).id).toBe('BILL-001')
  })

  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.billNumber).toBe('SI-2024-001')
    expect(result.contactId).toBe('VND-789')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(8000)
    expect(result.taxAmount).toBe(800)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
    expect(result.dueAt).toEqual(new Date('2024-04-05'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformBill(makeBill({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ Status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformBill(makeBill({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Void status to VOIDED', () => {
    expect(transformBill(makeBill({ Status: 'Void' })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
