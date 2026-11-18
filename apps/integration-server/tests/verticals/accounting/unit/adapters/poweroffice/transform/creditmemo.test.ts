import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type PowerOfficeCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/creditmemo'

function makeCreditNote(overrides: Partial<PowerOfficeCreditNote> = {}): PowerOfficeCreditNote {
  return {
    id: 55,
    customerId: 12,
    invoiceDate: '2024-04-01',
    currencyCode: 'NOK',
    grossAmount: 500,
    isPaid: false,
    isVoid: false,
    status: 5,
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id correctly', () => {
    expect(transformCreditMemo(makeCreditNote()).id).toBe('55')
  })

  it('maps customerId to contactId', () => {
    expect(transformCreditMemo(makeCreditNote()).contactId).toBe('12')
  })

  it('maps currencyCode to currency', () => {
    expect(transformCreditMemo(makeCreditNote()).currency).toBe('NOK')
  })

  it('maps grossAmount to totalAmount', () => {
    expect(transformCreditMemo(makeCreditNote()).totalAmount).toBe(500)
  })

  it('parses invoiceDate as Date object for postedAt', () => {
    expect(transformCreditMemo(makeCreditNote()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps isVoid true to VOIDED', () => {
    expect(transformCreditMemo(makeCreditNote({ isVoid: true, isPaid: true, status: 5 })).status).toBe('VOIDED')
  })

  it('maps isPaid true (not void) to PAID', () => {
    expect(transformCreditMemo(makeCreditNote({ isVoid: false, isPaid: true, status: 5 })).status).toBe('PAID')
  })

  it('maps status 5 (not paid, not void) to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ isVoid: false, isPaid: false, status: 5 })).status).toBe('AUTHORIZED')
  })

  it('maps status 0 (not paid, not void) to DRAFT', () => {
    expect(transformCreditMemo(makeCreditNote({ isVoid: false, isPaid: false, status: 0 })).status).toBe('DRAFT')
  })

  it('maps other status (not paid, not void) to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditNote({ isVoid: false, isPaid: false, status: 3 })).status).toBe('AUTHORIZED')
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
