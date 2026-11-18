import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type SellsyCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/sellsy/transform/creditmemo'

function makeCreditMemo(overrides: Partial<SellsyCreditMemo> = {}): SellsyCreditMemo {
  return {
    id: 'cm-001',
    number: 'AV-2024-001',
    contact_id: 'contact-1',
    currency: 'EUR',
    date: '2024-03-20',
    due_date: '2024-04-20',
    status: 'approved',
    total_amount: 1200,
    tax_amount: 200,
    paid_amount: 0,
    remaining_amount: 1200,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('AV-2024-001')
  })

  it('maps contact_id to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('contact-1')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(1200)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(200)
  })

  it('maps remaining_amount to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(1200)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-20'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).dueAt).toEqual(new Date('2024-04-20'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformCreditMemo(makeCreditMemo({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when approved with full remaining', () => {
    expect(
      transformCreditMemo(
        makeCreditMemo({ status: 'approved', remaining_amount: 1200, paid_amount: 0 }),
      ).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is paid', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when approved with partial payment', () => {
    expect(
      transformCreditMemo(
        makeCreditMemo({ status: 'approved', remaining_amount: 600, paid_amount: 600 }),
      ).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when cancelled', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'cancelled' })).status).toBe('VOIDED')
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
