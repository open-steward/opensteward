import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type DineroBill } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/bill'

function makeBill(overrides: Partial<DineroBill> = {}): DineroBill {
  return {
    Guid: 'bill-guid-001',
    Number: 501,
    ContactGuid: 'supplier-guid-001',
    Currency: 'DKK',
    Date: '2024-02-01',
    PaymentDate: '2024-03-01',
    TotalInclVat: 8000,
    TotalVat: 1600,
    RemainingAmount: 8000,
    PaymentAmount: 0,
    Status: 'Draft',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps Guid to id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-guid-001')
  })

  it('maps Number to billNumber as string', () => {
    expect(transformBill(makeBill()).billNumber).toBe('501')
  })

  it('maps ContactGuid to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('supplier-guid-001')
  })

  it('maps amount fields correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(8000)
    expect(b.taxAmount).toBe(1600)
    expect(b.balanceAmount).toBe(8000)
    expect(b.currency).toBe('DKK')
  })

  it('parses dates as Date objects', () => {
    const b = transformBill(makeBill())
    expect(b.postedAt).toEqual(new Date('2024-02-01'))
    expect(b.dueAt).toEqual(new Date('2024-03-01'))
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformBill(makeBill({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Booked status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ Status: 'Booked' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformBill(makeBill({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps PartPayment status to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ Status: 'PartPayment' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformBill(makeBill({ Status: 'Voided' })).status).toBe('VOIDED')
  })

  it('returns undefined contactId when ContactGuid is empty', () => {
    expect(transformBill(makeBill({ ContactGuid: '' })).contactId).toBeUndefined()
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
