import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type CampfireCreditMemo,
  type CampfireCreditMemoLine,
} from '../../../../../../../src/verticals/accounting/adapters/campfire/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCreditMemoLine(
  overrides: Partial<CampfireCreditMemoLine> = {},
): CampfireCreditMemoLine {
  return {
    id: 1,
    description: 'Widget refund',
    quantity: 2,
    rate: 25.0,
    amount: 50.0,
    tax: 5.0,
    product: 88,
    product_name: 'Widget',
    ...overrides,
  }
}

function makeCreditMemo(overrides: Partial<CampfireCreditMemo> = {}): CampfireCreditMemo {
  return {
    id: 77,
    credit_memo_number: 'CM-077',
    credit_memo_date: '2024-03-15',
    created_at: '2024-03-14T09:00:00Z',
    last_modified_at: '2024-03-15T10:00:00Z',
    client: 20,
    currency: 'USD',
    total_amount: 55.0,
    amount_used: 0.0,
    amount_remaining: 55.0,
    status: 'open',
    notes: 'Credit for overpayment',
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id to string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('77')
  })

  it('maps credit_memo_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-077')
  })

  it('maps client to contactId as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('20')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('converts total_amount to minor units', () => {
    expect(transformCreditMemo(makeCreditMemo({ total_amount: 55.0 })).totalAmount).toBe(5500)
  })

  it('converts amount_used to paidAmount in minor units', () => {
    expect(transformCreditMemo(makeCreditMemo({ amount_used: 10.0 })).paidAmount).toBe(1000)
  })

  it('converts amount_remaining to balanceAmount in minor units', () => {
    expect(transformCreditMemo(makeCreditMemo({ amount_remaining: 55.0 })).balanceAmount).toBe(5500)
  })

  it('maps status open to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps status used to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'used' })).status).toBe('PAID')
  })

  it('maps status partially_used to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'partially_used' })).status).toBe(
      'PARTIALLY_PAID',
    )
  })

  it('maps status voided to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: null })).status).toBe('DRAFT')
  })

  it('maps notes', () => {
    expect(transformCreditMemo(makeCreditMemo()).notes).toBe('Credit for overpayment')
  })

  it('maps credit_memo_date to postedAt Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps created_at to createdAt Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).createdAt).toEqual(
      new Date('2024-03-14T09:00:00Z'),
    )
  })

  it('maps last_modified_at to updatedAt Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).updatedAt).toEqual(
      new Date('2024-03-15T10:00:00Z'),
    )
  })

  it('maps line items with amount conversion', () => {
    const raw = makeCreditMemo({ lines: [makeCreditMemoLine()] })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('88')
    expect(li.itemName).toBe('Widget')
    expect(li.itemDescription).toBe('Widget refund')
    expect(li.unitAmount).toBe(2500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(5000)
    expect(li.taxAmount).toBe(500)
  })

  it('defaults to empty lineItems when lines is absent', () => {
    const result = transformCreditMemo(makeCreditMemo({ lines: undefined }))
    expect(result.lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo()))).not.toThrow()
  })
})
