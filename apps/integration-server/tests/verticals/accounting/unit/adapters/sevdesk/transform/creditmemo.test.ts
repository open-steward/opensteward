import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type SevDeskCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/creditmemo'

function makeCreditNote(overrides: Partial<SevDeskCreditNote> = {}): SevDeskCreditNote {
  return {
    id: 'cn-1',
    invoiceNumber: 'CN-2024-001',
    contact: { id: 'con-1' },
    invoiceDate: '2024-04-01',
    payDate: null,
    currency: 'EUR',
    sumNet: '500.00',
    sumGross: '595.00',
    sumTax: '95.00',
    sumDiscounts: '0.00',
    status: '200',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('cn-1')
  })

  it('maps invoiceNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditNote()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps contact id to contactId', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('con-1')
  })

  it('maps currency correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).currency).toBe('EUR')
  })

  it('parses sumGross as totalAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(595)
  })

  it('parses sumTax as taxAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).taxAmount).toBe(95)
  })

  it('parses invoiceDate as Date object', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps payDate to paidAt as Date object', () => {
    const cm = transformCreditMemo(makeCreditNote({ payDate: '2024-04-15' }))
    expect(cm.paidAt).toEqual(new Date('2024-04-15'))
  })

  it('maps status 100 to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ status: '100' })).status).toBe('DRAFT')
  })

  it('maps status 200 without payDate to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: '200', payDate: null })).status).toBe('AUTHORIZED')
  })

  it('maps status 200 with payDate to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ status: '200', payDate: '2024-04-15' })).status).toBe('PAID')
  })

  it('maps status 1000 to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ status: '1000' })).status).toBe('VOIDED')
  })

  it('handles null contact', () => {
    expect(transformCreditMemo(makeCreditNote({ contact: null })).contactId).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditNote()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditNote())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
