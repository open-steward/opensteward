import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type StessaCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/stessa/transform/creditmemo'

function makeCreditMemo(overrides: Partial<StessaCreditMemo> = {}): StessaCreditMemo {
  return {
    id: 'cm-001',
    creditMemoNumber: 'CM-2024-001',
    contactId: 'contact-7',
    currency: 'USD',
    subtotal: 800,
    taxAmount: 168,
    total: 968,
    date: '2024-03-01',
    dueDate: '2024-04-01',
    status: 'sent',
    paidAmount: 0,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps creditMemoNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-2024-001')
  })

  it('maps contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('contact-7')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(968)
    expect(cm.taxAmount).toBe(168)
    expect(cm.balanceAmount).toBe(968)
  })

  it('maps date (ISO string) to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps dueDate (ISO string) to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps status DRAFT when status is draft', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when status is sent with no payment', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'sent', paidAmount: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when status is paid', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when status is sent with partial payment', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ status: 'sent', paidAmount: 400, total: 968 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when status is void', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps status AUTHORIZED when status is overdue', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'overdue' })).status).toBe('AUTHORIZED')
  })

  it('maps status DELETED when status is deleted', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'deleted' })).status).toBe('DELETED')
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
