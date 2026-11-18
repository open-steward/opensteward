import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type MekariJurnalBill } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/bill'

function makeBill(overrides: Partial<MekariJurnalBill> = {}): MekariJurnalBill {
  return {
    id: 201,
    transaction_no: 'BILL-001',
    status: 'open',
    transaction_date: '2024-03-01',
    due_date: '2024-03-31',
    total: 3000000,
    tax_amount: 300000,
    currency_code: 'IDR',
    person_id: 15,
    lines: [],
    ...overrides,
  }
}

describe('transformBill (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('201')
    expect(result.billNumber).toBe('BILL-001')
    expect(result.contactId).toBe('15')
    expect(result.totalAmount).toBe(3000000)
    expect(result.taxAmount).toBe(300000)
    expect(result.currency).toBe('IDR')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps open status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps partially_paid status to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps voided status to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps draft/unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
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
