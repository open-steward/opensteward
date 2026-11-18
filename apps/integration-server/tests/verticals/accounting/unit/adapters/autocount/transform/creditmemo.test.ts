import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type AutocountCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/creditmemo'

function makeRaw(overrides: Partial<AutocountCreditNote> = {}): AutocountCreditNote {
  return {
    DocNo: 'CN-001',
    DocDate: '2024-03-15',
    SubTotal: 500,
    TaxAmt: 30,
    DocAmt: 530,
    CreditBalance: 530,
    DebtorCode: 'D001',
    DebtorName: 'Acme Sdn Bhd',
    Cancelled: false,
    DetailItems: [],
    ...overrides,
  }
}

describe('transformCreditMemo (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('CN-001')
    expect(result.creditmemoNumber).toBe('CN-001')
    expect(result.contactId).toBe('D001')
    expect(result.totalAmount).toBe(530)
    expect(result.taxAmount).toBe(30)
    expect(result.balanceAmount).toBe(530)
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps cancelled credit note to VOIDED', () => {
    const result = transformCreditMemo(makeRaw({ Cancelled: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps zero credit balance to PAID', () => {
    const result = transformCreditMemo(makeRaw({ CreditBalance: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partial credit balance to PARTIALLY_PAID', () => {
    const result = transformCreditMemo(makeRaw({ CreditBalance: 265, DocAmt: 530 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps full credit balance to AUTHORIZED', () => {
    const result = transformCreditMemo(makeRaw({ CreditBalance: 530, DocAmt: 530 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps DetailItems to lineItems', () => {
    const raw = makeRaw({
      DetailItems: [
        {
          Seq: 1,
          ItemCode: 'ITEM-A',
          Description: 'Returned goods',
          Qty: 2,
          UnitPrice: 250,
          Amount: 500,
          TaxAmt: 30,
          TaxCode: 'SR',
          AccNo: '300-000',
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].totalAmount).toBe(500)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
