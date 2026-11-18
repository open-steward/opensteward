import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type AlegraBill } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/bill'

function makeBill(overrides: Partial<AlegraBill> = {}): AlegraBill {
  return {
    id: 10,
    numberTemplate: { number: '001', prefix: 'BILL-' },
    date: '2024-01-15',
    dueDate: '2024-02-15',
    providerId: 7,
    total: 12000,
    totalTax: 2000,
    balance: 12000,
    currency: 'COP',
    status: 'open',
    items: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id to string', () => {
    expect(transformBill(makeBill()).id).toBe('10')
  })

  it('maps numberTemplate to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps providerId to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('7')
  })

  it('maps total and tax amounts', () => {
    const result = transformBill(makeBill())
    expect(result.totalAmount).toBe(12000)
    expect(result.taxAmount).toBe(2000)
    expect(result.balanceAmount).toBe(12000)
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('COP')
  })

  it('maps status DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED for open', () => {
    expect(transformBill(makeBill({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED for void', () => {
    expect(transformBill(makeBill({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
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
