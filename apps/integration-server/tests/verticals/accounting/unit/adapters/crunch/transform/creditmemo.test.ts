import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformCreditNote,
  type CrunchCreditNoteDto,
} from '../../../../../../../src/verticals/accounting/adapters/crunch/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCreditNote(overrides: Partial<CrunchCreditNoteDto> = {}): CrunchCreditNoteDto {
  return {
    id: 3,
    date: '2026-02-15',
    amount: 50.5,
    state: 'ISSUED',
    ...overrides,
  }
}

describe('transformCreditNote (crunch)', () => {
  it('maps numeric id to string', () => {
    expect(transformCreditNote(makeCreditNote()).id).toBe('3')
  })

  it('ISSUED state → AUTHORIZED', () => {
    expect(transformCreditNote(makeCreditNote({ state: 'ISSUED' })).status).toBe('AUTHORIZED')
  })

  it('DRAFT state → DRAFT', () => {
    expect(transformCreditNote(makeCreditNote({ state: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('PAID state → PAID', () => {
    expect(transformCreditNote(makeCreditNote({ state: 'PAID' })).status).toBe('PAID')
  })

  it('VOIDED state → VOIDED', () => {
    expect(transformCreditNote(makeCreditNote({ state: 'VOIDED' })).status).toBe('VOIDED')
  })

  it('unknown state → AUTHORIZED (fallback)', () => {
    expect(transformCreditNote(makeCreditNote({ state: 'SOMETHING_ELSE' })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('converts float amount to minor units', () => {
    // 50.5 → 5050 pence
    expect(transformCreditNote(makeCreditNote()).totalAmount).toBe(5050)
  })

  it('passes through contactId parameter', () => {
    expect(transformCreditNote(makeCreditNote(), 'inv-7', 'cus-3').contactId).toBe('cus-3')
  })

  it('stores _invoiceId in metadata', () => {
    const result = transformCreditNote(makeCreditNote(), 'inv-7', 'cus-3')
    expect((result.metadata as Record<string, unknown>)['_invoiceId']).toBe('inv-7')
  })

  it('links the parent invoice through appliedTo', () => {
    const result = CreditMemoSchema.parse(transformCreditNote(makeCreditNote(), 'inv-7', 'cus-3'))
    expect(result.appliedTo).toEqual([{ invoiceId: 'inv-7' }])
  })

  it('omits appliedTo when no parent invoice id is passed', () => {
    const result = CreditMemoSchema.parse(transformCreditNote(makeCreditNote()))
    expect(result.appliedTo).toBeUndefined()
  })

  it('parses date as postedAt', () => {
    const result = transformCreditNote(makeCreditNote())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2026-02-15')).toBe(true)
  })

  it('passes CreditMemoSchema.parse without throwing', () => {
    const result = transformCreditNote(makeCreditNote(), 'inv-7', 'cus-3')
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
