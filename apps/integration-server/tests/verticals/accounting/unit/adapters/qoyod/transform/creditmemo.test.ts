import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type QoyodCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeRaw(overrides: Partial<QoyodCreditNote> = {}): QoyodCreditNote {
  return {
    id: 500,
    reference: 'CM-2025-001',
    customer_id: 300,
    date: '2025-05-01',
    due_date: '2025-06-01',
    status: 'approved',
    notes: 'Refund for damaged goods',
    currency: 'SAR',
    subtotal: 500,
    tax_total: 75,
    discount_total: 0,
    total: 575,
    paid_amount: 0,
    balance: 575,
    line_items: [
      {
        id: 11,
        product_id: 20,
        description: 'Damaged item credit',
        quantity: 2,
        unit_price: 250,
        // Use integer amounts so the canonical Amount (safeint) schema accepts them
        tax_amount: 38,
        total: 538,
        discount: 0,
        account_id: 30,
      },
    ],
    ...overrides,
  }
}

describe('qoyod transformCreditMemo', () => {
  it('maps numeric id to string', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('500')
  })

  it('maps reference to creditmemoNumber', () => {
    expect(transformCreditMemo(makeRaw()).creditmemoNumber).toBe('CM-2025-001')
  })

  it('falls back to String(id) when reference absent', () => {
    expect(transformCreditMemo(makeRaw({ reference: null })).creditmemoNumber).toBe('500')
  })

  it('maps approved status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps issued status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'issued' })).status).toBe('AUTHORIZED')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformCreditMemo(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps paid status to PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps voided status to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps customer_id to contactId as string', () => {
    expect(transformCreditMemo(makeRaw()).contactId).toBe('300')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeRaw()).currency).toBe('SAR')
  })

  it('maps total directly (no ×100 conversion)', () => {
    expect(transformCreditMemo(makeRaw()).totalAmount).toBe(575)
  })

  it('maps tax_total to taxAmount', () => {
    expect(transformCreditMemo(makeRaw()).taxAmount).toBe(75)
  })

  it('maps discount_total to discountAmount', () => {
    expect(transformCreditMemo(makeRaw()).discountAmount).toBe(0)
  })

  it('maps notes', () => {
    expect(transformCreditMemo(makeRaw()).notes).toBe('Refund for damaged goods')
  })

  it('maps date to postedAt Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line discount to discountAmount on lineitem', () => {
    expect(transformCreditMemo(makeRaw()).lineItems?.[0]?.discountAmount).toBe(0)
  })

  it('passes CreditMemoSchema.parse', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeRaw()))).not.toThrow()
  })
})
