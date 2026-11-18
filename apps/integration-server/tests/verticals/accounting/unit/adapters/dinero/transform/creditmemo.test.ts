import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type DineroCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/creditmemo'

function makeCreditMemo(overrides: Partial<DineroCreditMemo> = {}): DineroCreditMemo {
  return {
    Guid: 'cm-guid-001',
    Number: 201,
    ContactGuid: 'contact-guid-001',
    Currency: 'DKK',
    Date: '2024-03-01',
    PaymentDate: '2024-03-31',
    TotalInclVat: -10000,
    TotalVat: -2000,
    RemainingAmount: -10000,
    PaymentAmount: 0,
    Status: 'Draft',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps Guid to id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-guid-001')
  })

  it('maps Number to creditmemoNumber as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('201')
  })

  it('maps ContactGuid to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('contact-guid-001')
  })

  it('maps TotalInclVat to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(-10000)
  })

  it('maps TotalVat to taxAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).taxAmount).toBe(-2000)
  })

  it('maps Currency to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('DKK')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Booked status to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Booked' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps PartPayment status to PARTIALLY_PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'PartPayment' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps Voided status to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Status: 'Voided' })).status).toBe('VOIDED')
  })

  it('maps Date to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps PaymentDate to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-03-31')).toBe(true)
  })

  it('returns undefined contactId when ContactGuid is empty', () => {
    expect(transformCreditMemo(makeCreditMemo({ ContactGuid: '' })).contactId).toBeUndefined()
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
