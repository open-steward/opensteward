import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type LexofficeCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/creditmemo'

function makeCreditNote(overrides: Partial<LexofficeCreditNote> = {}): LexofficeCreditNote {
  return {
    id: 'cn-uuid-001',
    voucherNumber: 'CN-2024-001',
    voucherDate: '2024-03-15',
    contactId: 'contact-uuid-001',
    totalAmount: 500,
    openAmount: 500,
    currency: 'EUR',
    voucherStatus: 'open',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('cn-uuid-001')
  })

  it('maps voucherNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditNote()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps contactId correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('contact-uuid-001')
  })

  it('maps currency correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).currency).toBe('EUR')
  })

  it('maps totalAmount correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(500)
  })

  it('maps openAmount to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).balanceAmount).toBe(500)
  })

  it('parses voucherDate as Date object for postedAt', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps voucherStatus draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ voucherStatus: 'draft' })).status).toBe('DRAFT')
  })

  it('maps voucherStatus open to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ voucherStatus: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps voucherStatus paid to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ voucherStatus: 'paid' })).status).toBe('PAID')
  })

  it('maps voucherStatus paidoff to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ voucherStatus: 'paidoff' })).status).toBe('PAID')
  })

  it('maps voucherStatus voided to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ voucherStatus: 'voided' })).status).toBe('VOIDED')
  })

  it('maps unknown voucherStatus to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ voucherStatus: 'other' })).status).toBe('DRAFT')
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
