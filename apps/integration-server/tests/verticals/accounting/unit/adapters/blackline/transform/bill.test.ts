import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type BlacklineBill } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/bill'

function makeBill(overrides: Partial<BlacklineBill> = {}): BlacklineBill {
  return {
    reconciliationId: 'rec-002',
    billNumber: 'BILL-2024-001',
    status: 'Draft',
    vendorId: 'vendor-456',
    currency: 'USD',
    amount: 800,
    taxAmount: 80,
    dueDate: '2024-04-30',
    postedDate: '2024-03-01',
    createdBy: 'user-1',
    createdAt: '2024-03-01T10:00:00Z',
    modifiedBy: 'user-1',
    modifiedAt: '2024-03-01T10:00:00Z',
    lines: [],
    ...overrides,
  }
}

describe('transformBill (BlackLine)', () => {
  it('maps id from reconciliationId', () => {
    expect(transformBill(makeBill()).id).toBe('rec-002')
  })

  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('vendor-456')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(800)
    expect(result.taxAmount).toBe(80)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-30'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Submitted status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'Submitted' })).status).toBe('AUTHORIZED')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Closed status to PAID', () => {
    expect(transformBill(makeBill({ status: 'Closed' })).status).toBe('PAID')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'Voided' })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
