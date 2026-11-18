import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  type CalxaCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCreditMemo(overrides: Partial<CalxaCreditMemo> = {}): CalxaCreditMemo {
  return {
    id: 'cm-001',
    creditNoteNumber: 'CN-001',
    contactId: 'contact-42',
    status: 'authorised',
    currency: 'USD',
    total: 500,
    totalTax: 50,
    remainingCredit: 500,
    appliedAmount: 0,
    date: '2024-03-15',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id as-is', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps creditNoteNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-001')
  })

  it('maps contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('contact-42')
  })

  it('maps currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(500)
  })

  it('maps totalTax to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(50)
  })

  it('maps remainingCredit to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(500)
  })

  it('maps appliedAmount to paidAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).paidAmount).toBe(0)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined postedAt when date is undefined', () => {
    expect(transformCreditMemo(makeCreditMemo({ date: undefined })).postedAt).toBeUndefined()
  })

  it('maps status authorised to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'authorised' })).status).toBe('AUTHORIZED')
  })

  it('maps status authorized to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'authorized' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status voided to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps status void to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps status deleted to DELETED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'deleted' })).status).toBe('DELETED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps createdAt to Date', () => {
    const result = transformCreditMemo(makeCreditMemo({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformCreditMemo(makeCreditMemo({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo()))).not.toThrow()
  })
})
