import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type AccountEdgeCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/accountedge/transform/creditmemo'

function makeCreditMemo(overrides: Partial<AccountEdgeCreditMemo> = {}): AccountEdgeCreditMemo {
  return {
    id: 'cm-001',
    credit_memo_number: 'CM-2024-001',
    contact_id: 'ct-100',
    currency: 'USD',
    subtotal: 800,
    tax_amount: 80,
    total: 880,
    amount_paid: 200,
    date: '2024-03-10',
    due_date: '2024-04-10',
    status: 'approved',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps credit_memo_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-2024-001')
  })

  it('maps contact_id to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('ct-100')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(880)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(80)
  })

  it('computes balanceAmount as total minus amount_paid', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(680)
  })

  it('maps amount_paid to paidAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).paidAmount).toBe(200)
  })

  it('parses date to postedAt', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('parses due_date to dueAt', () => {
    expect(transformCreditMemo(makeCreditMemo()).dueAt).toEqual(new Date('2024-04-10'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformCreditMemo(makeCreditMemo({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined dueAt when due_date is empty', () => {
    expect(transformCreditMemo(makeCreditMemo({ due_date: '' })).dueAt).toBeUndefined()
  })

  it('maps status "void" to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps status "paid" to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status "partial" to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status "approved" to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'open' })).status).toBe('DRAFT')
  })

  it('returns undefined creditmemoNumber when credit_memo_number is empty', () => {
    expect(transformCreditMemo(makeCreditMemo({ credit_memo_number: '' })).creditmemoNumber).toBeUndefined()
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
