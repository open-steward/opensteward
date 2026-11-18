import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type FoundationBill } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/bill'

function makeBill(overrides: Partial<FoundationBill> = {}): FoundationBill {
  return {
    BillNumber: 'BILL-001',
    JobNumber: 'JOB-100',
    VendorId: 'VEND-42',
    BillDate: '2024-03-01',
    DueDate: '2024-03-31',
    Amount: 2000,
    TaxAmount: 200,
    Currency: 'USD',
    Status: 'Draft',
    Lines: [],
    ...overrides,
  }
}

describe('transformBill (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('BILL-001')
    expect(result.billNumber).toBe('BILL-001')
    expect(result.contactId).toBe('VEND-42')
    expect(result.totalAmount).toBe(2000)
    expect(result.taxAmount).toBe(200)
    expect(result.currency).toBe('USD')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
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

  it('maps bill lines to lineItems', () => {
    const raw = makeBill({
      Lines: [
        {
          LineId: 10,
          Description: 'Materials',
          Quantity: 5,
          UnitPrice: 200,
          TotalAmount: 1000,
          TaxAmount: 100,
          AccountNumber: '6000',
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemDescription).toBe('Materials')
    expect(li.accountId).toBe('6000')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
