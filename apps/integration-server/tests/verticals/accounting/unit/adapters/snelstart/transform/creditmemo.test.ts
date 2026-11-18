import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type SnelStartCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/creditmemo'

function makeCreditMemo(overrides: Partial<SnelStartCreditMemo> = {}): SnelStartCreditMemo {
  return {
    id: 'cm-001',
    factuurnummer: 'CN-2024-001',
    relatie: { id: 'rel-7' },
    factuurbedrag: -10000,
    btw: -2100,
    openstaandSaldo: -10000,
    betaaldBedrag: 0,
    valutacode: 'EUR',
    factuurdatum: '2024-03-01',
    vervalDatum: '2024-03-31',
    factuurstatus: 'openstaand',
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps id from raw id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('cm-001')
  })

  it('maps factuurnummer to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CN-2024-001')
  })

  it('maps relatie.id to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('rel-7')
  })

  it('maps valutacode to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const cm = transformCreditMemo(makeCreditMemo())
    expect(cm.totalAmount).toBe(-10000)
    expect(cm.taxAmount).toBe(-2100)
    expect(cm.balanceAmount).toBe(-10000)
  })

  it('maps factuurdatum to postedAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString().startsWith('2024-03-01')).toBe(true)
  })

  it('maps vervalDatum to dueAt as Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(expectDate(result.dueAt).toISOString().startsWith('2024-03-31')).toBe(true)
  })

  it('maps status DRAFT when factuurstatus is concept', () => {
    expect(transformCreditMemo(makeCreditMemo({ factuurstatus: 'concept' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when factuurstatus is openstaand', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ factuurstatus: 'openstaand', openstaandSaldo: -10000, betaaldBedrag: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when openstaandSaldo is 0', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ factuurstatus: 'betaald', openstaandSaldo: 0, factuurbedrag: -10000 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when partially paid', () => {
    expect(
      transformCreditMemo(makeCreditMemo({ factuurstatus: 'openstaand', openstaandSaldo: -5000, betaaldBedrag: 5000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when factuurstatus is vervallen', () => {
    expect(transformCreditMemo(makeCreditMemo({ factuurstatus: 'vervallen' })).status).toBe('VOIDED')
  })

  it('returns undefined contactId when relatie is null', () => {
    expect(transformCreditMemo(makeCreditMemo({ relatie: null })).contactId).toBeUndefined()
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
