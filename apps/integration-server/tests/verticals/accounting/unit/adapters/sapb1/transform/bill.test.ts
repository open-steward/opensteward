import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type SapB1Bill,
  type SapB1BillLine,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/bill'

function makeBillLine(overrides: Partial<SapB1BillLine> = {}): SapB1BillLine {
  return {
    ItemCode: 'ITEM-001',
    ItemDescription: 'Widget',
    Quantity: 2,
    UnitPrice: 100,
    LineTotal: 200,
    VatAmount: 40,
    AccountCode: 'ACCT-001',
    ...overrides,
  }
}

function makeBill(overrides: Partial<SapB1Bill> = {}): SapB1Bill {
  return {
    DocNum: 1001,
    CardCode: 'BP-001',
    DocDate: '2024-03-01',
    DocDueDate: '2024-04-01',
    DocCurrency: 'USD',
    DocTotal: 1200,
    VatSum: 200,
    PaidToDate: 0,
    DocStatus: 'O',
    Cancelled: 'N',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps DocNum as string to id', () => {
    expect(transformBill(makeBill()).id).toBe('1001')
  })

  it('maps DocNum as string to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('1001')
  })

  it('maps CardCode to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('BP-001')
  })

  it('maps DocCurrency to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps DocTotal to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1200)
  })

  it('maps VatSum to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(200)
  })

  it('maps PaidToDate to paidAmount', () => {
    expect(transformBill(makeBill()).paidAmount).toBe(0)
  })

  it('computes balanceAmount as DocTotal minus PaidToDate', () => {
    expect(transformBill(makeBill({ DocTotal: 1200, PaidToDate: 400 })).balanceAmount).toBe(800)
  })

  it('parses DocDate as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses DocDueDate as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps Cancelled Y to VOIDED', () => {
    expect(transformBill(makeBill({ Cancelled: 'Y' })).status).toBe('VOIDED')
  })

  it('maps DocStatus C to PAID when not cancelled', () => {
    expect(transformBill(makeBill({ DocStatus: 'C', Cancelled: 'N' })).status).toBe('PAID')
  })

  it('maps open doc with partial payment to PARTIALLY_PAID', () => {
    expect(
      transformBill(makeBill({ DocStatus: 'O', Cancelled: 'N', PaidToDate: 500 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps open doc with no payment to AUTHORIZED', () => {
    expect(
      transformBill(makeBill({ DocStatus: 'O', Cancelled: 'N', PaidToDate: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps DocumentLines to lineItems', () => {
    const result = transformBill(makeBill({ DocumentLines: [makeBillLine()] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('ITEM-001')
    expect(result.lineItems![0].unitAmount).toBe(100)
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].totalAmount).toBe(200)
    expect(result.lineItems![0].taxAmount).toBe(40)
  })

  it('produces empty lineItems when DocumentLines is absent', () => {
    expect(transformBill(makeBill()).lineItems).toHaveLength(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
