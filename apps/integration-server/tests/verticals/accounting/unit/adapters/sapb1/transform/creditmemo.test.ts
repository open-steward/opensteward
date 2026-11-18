import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type SapB1CreditMemo,
  type SapB1CreditMemoLine,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/creditmemo'

function makeCreditMemoLine(overrides: Partial<SapB1CreditMemoLine> = {}): SapB1CreditMemoLine {
  return {
    ItemCode: 'ITEM-001',
    ItemDescription: 'Widget',
    Quantity: 1,
    UnitPrice: 200,
    LineTotal: 200,
    VatAmount: 40,
    AccountCode: 'ACCT-001',
    ...overrides,
  }
}

function makeCreditMemo(overrides: Partial<SapB1CreditMemo> = {}): SapB1CreditMemo {
  return {
    DocNum: 2001,
    CardCode: 'BP-001',
    DocDate: '2024-03-01',
    DocDueDate: '2024-04-01',
    DocCurrency: 'EUR',
    DocTotal: 500,
    VatSum: 100,
    PaidToDate: 0,
    DocStatus: 'O',
    Cancelled: 'N',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps DocNum as string to id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('2001')
  })

  it('maps DocNum as string to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('2001')
  })

  it('maps CardCode to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('BP-001')
  })

  it('maps DocCurrency to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps DocTotal to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(500)
  })

  it('maps VatSum to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(100)
  })

  it('maps PaidToDate to paidAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).paidAmount).toBe(0)
  })

  it('computes balanceAmount as DocTotal minus PaidToDate', () => {
    expect(transformCreditMemo(makeCreditMemo({ DocTotal: 500, PaidToDate: 200 })).balanceAmount).toBe(300)
  })

  it('parses DocDate as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses DocDueDate as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps Cancelled Y to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Cancelled: 'Y' })).status).toBe('VOIDED')
  })

  it('maps DocStatus C to PAID when not cancelled', () => {
    expect(transformCreditMemo(makeCreditMemo({ DocStatus: 'C', Cancelled: 'N' })).status).toBe('PAID')
  })

  it('maps open doc with partial payment to PARTIALLY_PAID', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ DocStatus: 'O', Cancelled: 'N', PaidToDate: 200 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps open doc with no payment to AUTHORIZED', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ DocStatus: 'O', Cancelled: 'N', PaidToDate: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps DocumentLines to lineItems', () => {
    const result = transformCreditMemo(makeCreditMemo({ DocumentLines: [makeCreditMemoLine()] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('ITEM-001')
    expect(result.lineItems![0].totalAmount).toBe(200)
  })

  it('produces empty lineItems when DocumentLines is absent', () => {
    expect(transformCreditMemo(makeCreditMemo()).lineItems).toHaveLength(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
