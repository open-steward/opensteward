import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type HoldedCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/holded/transform/creditmemo'

function makeCreditMemo(overrides: Partial<HoldedCreditMemo> = {}): HoldedCreditMemo {
  return {
    id: 'cm-001',
    invoiceNum: 'R-2024-001',
    contact: 'contact-7',
    currency: 'EUR',
    subtotal: 800,
    tax: 168,
    total: 968,
    date: 1709251200, // 2024-03-01
    dueDate: 1711929600, // 2024-04-01
    status: 1,
    paid: 0,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps invoiceNum to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('R-2024-001')
  })

  it('maps contact to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('contact-7')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(968)
    expect(cm.taxAmount).toBe(168)
    expect(cm.balanceAmount).toBe(968)
  })

  it('maps date (unix timestamp) to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.postedAt).toEqual(new Date(1709251200 * 1000))
  })

  it('maps dueDate (unix timestamp) to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(result.dueAt).toEqual(new Date(1711929600 * 1000))
  })

  it('maps status DRAFT when status is 0', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when status is 1 with no payment', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 1, paid: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is 2', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 2 })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when status is 1 with partial payment', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 1, paid: 400, total: 968 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when status is 4', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 4 })).status).toBe('VOIDED')
  })

  it('maps status AUTHORIZED when status is 3 (overdue)', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 3 })).status).toBe('AUTHORIZED')
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
