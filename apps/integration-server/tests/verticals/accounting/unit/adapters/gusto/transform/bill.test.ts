import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type GustoBill } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/bill'

function makeBill(overrides: Partial<GustoBill> = {}): GustoBill {
  return {
    id: 'bill_101',
    status: 'draft',
    due_date: '2024-04-15',
    vendor_id: 'vendor_42',
    total_amount: 2500,
    currency: 'USD',
    lines: [],
    ...overrides,
  }
}

describe('transformBill (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformBill(makeBill({ id: 'bill_101' })).id).toBe('bill_101')
  })

  it('maps numeric id to string', () => {
    expect(transformBill(makeBill({ id: 42 })).id).toBe('42')
  })

  it('maps total_amount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(2500)
  })

  it('maps vendor_id to contactId', () => {
    expect(transformBill(makeBill({ vendor_id: 'vendor_99' })).contactId).toBe('vendor_99')
  })

  it('maps due_date as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-15'))
  })

  it('maps draft status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps approved status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps void status to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'pending' })).status).toBe('DRAFT')
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('maps tax_amount', () => {
    expect(transformBill(makeBill({ tax_amount: 250 })).taxAmount).toBe(250)
  })

  it('maps currency', () => {
    expect(transformBill(makeBill({ currency: 'GBP' })).currency).toBe('GBP')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill({ id: 'bill_101' }))
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
