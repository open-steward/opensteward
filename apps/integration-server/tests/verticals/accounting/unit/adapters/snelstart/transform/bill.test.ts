import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type SnelStartBill,
} from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/bill'

function makeBill(overrides: Partial<SnelStartBill> = {}): SnelStartBill {
  return {
    id: 'bill-001',
    factuurnummer: 'INK-2024-001',
    relatie: { id: 'rel-5' },
    factuurbedrag: 5000,
    btw: 1050,
    openstaandSaldo: 5000,
    betaaldBedrag: 0,
    valutacode: 'EUR',
    factuurdatum: '2024-02-01',
    vervalDatum: '2024-03-01',
    factuurstatus: 'openstaand',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps factuurnummer to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('INK-2024-001')
  })

  it('maps relatie.id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('rel-5')
  })

  it('maps valutacode to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(5000)
    expect(b.taxAmount).toBe(1050)
    expect(b.balanceAmount).toBe(5000)
  })

  it('maps factuurdatum to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps vervalDatum to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when factuurdatum is empty', () => {
    expect(transformBill(makeBill({ factuurdatum: '' })).postedAt).toBeUndefined()
  })

  it('maps status DRAFT when factuurstatus is concept', () => {
    expect(transformBill(makeBill({ factuurstatus: 'concept' })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED when factuurstatus is openstaand', () => {
    expect(
      transformBill(makeBill({ factuurstatus: 'openstaand', openstaandSaldo: 5000, betaaldBedrag: 0 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps status PAID when openstaandSaldo is 0 and factuurbedrag > 0', () => {
    expect(
      transformBill(makeBill({ factuurstatus: 'betaald', openstaandSaldo: 0, factuurbedrag: 5000 })).status,
    ).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID when partially paid', () => {
    expect(
      transformBill(makeBill({ factuurstatus: 'openstaand', openstaandSaldo: 3000, betaaldBedrag: 2000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when factuurstatus is vervallen', () => {
    expect(transformBill(makeBill({ factuurstatus: 'vervallen' })).status).toBe('VOIDED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
