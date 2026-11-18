import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type AutocountBill,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/bill'

function makeRaw(overrides: Partial<AutocountBill> = {}): AutocountBill {
  return {
    DocNo: 'PI-001',
    DocDate: '2024-03-01',
    DueDate: '2024-03-31',
    SubTotal: 2000,
    TaxAmt: 120,
    DocAmt: 2120,
    CreditBalance: 2120,
    CreditorCode: 'C001',
    CreditorName: 'Supplier Sdn Bhd',
    CurrencyCode: 'MYR',
    Cancelled: false,
    Posted: false,
    DetailItems: [],
    ...overrides,
  }
}

describe('transformBill (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('PI-001')
    expect(result.billNumber).toBe('PI-001')
    expect(result.contactId).toBe('C001')
    expect(result.currency).toBe('MYR')
    expect(result.totalAmount).toBe(2120)
    expect(result.taxAmount).toBe(120)
    expect(result.balanceAmount).toBe(2120)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps non-posted bill to DRAFT', () => {
    const result = transformBill(makeRaw({ Posted: false, Cancelled: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps posted bill with zero credit balance to PAID', () => {
    const result = transformBill(makeRaw({ Posted: true, CreditBalance: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps posted bill with partial credit balance to PARTIALLY_PAID', () => {
    const result = transformBill(makeRaw({ Posted: true, CreditBalance: 1000, DocAmt: 2120 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps cancelled bill to VOIDED', () => {
    const result = transformBill(makeRaw({ Cancelled: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps DetailItems to lineItems', () => {
    const raw = makeRaw({
      DetailItems: [
        {
          Seq: 1,
          ItemCode: 'SVC-001',
          Description: 'Service Fee',
          Qty: 1,
          UnitPrice: 2000,
          Amount: 2000,
          TaxAmt: 120,
          TaxCode: 'TX',
          AccNo: '200-000',
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('SVC-001')
    expect(li.totalAmount).toBe(2000)
    expect(li.taxAmount).toBe(120)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
