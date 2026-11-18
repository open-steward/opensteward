import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type PandleCreditMemo,
  type PandleCreditMemoLine,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/creditmemo'

function makeCreditMemoLine(overrides: Partial<PandleCreditMemoLine> = {}): PandleCreditMemoLine {
  return {
    id: 401,
    account_id: 4000,
    description: 'Refund for damaged goods',
    quantity: 1,
    unit_price: 500,
    net_amount: 500,
    tax_rate_id: 1,
    tax_amount: 100,
    total_amount: 600,
    ...overrides,
  }
}

function makeCreditMemo(overrides: Partial<PandleCreditMemo> = {}): PandleCreditMemo {
  return {
    id: 7001,
    credit_note_number: 'CN-001',
    customer_id: 50,
    currency: 'GBP',
    issue_date: '2024-03-01',
    status: 'sent',
    net_amount: 500,
    tax_amount: 100,
    total_amount: 600,
    paid_amount: 0,
    balance: 600,
    credit_note_lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('7001')
  })

  it('maps credit_note_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-001')
  })

  it('maps customer_id to contactId as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('50')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('GBP')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(600)
    expect(cm.taxAmount).toBe(100)
    expect(cm.balanceAmount).toBe(600)
  })

  it('maps issue_date to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps status draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status sent to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status part_paid to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'part_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status void to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps credit_note_lines to lineItems', () => {
    const raw = makeCreditMemo({ credit_note_lines: [makeCreditMemoLine()] })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('401')
    expect(result.lineItems![0].accountId).toBe('4000')
    expect(result.lineItems![0].itemDescription).toBe('Refund for damaged goods')
    expect(result.lineItems![0].unitAmount).toBe(500)
    expect(result.lineItems![0].unitQuantity).toBe(1)
    expect(result.lineItems![0].totalAmount).toBe(600)
    expect(result.lineItems![0].taxAmount).toBe(100)
  })

  it('returns undefined postedAt when issue_date is empty', () => {
    expect(transformCreditMemo(makeCreditMemo({ issue_date: '' })).postedAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
