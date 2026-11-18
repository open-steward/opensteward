import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  untransformExpense,
  type IfirmaWydatek,
} from '../../../../../../../src/verticals/accounting/adapters/ifirma/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeExpense(overrides: Partial<IfirmaWydatek> = {}): IfirmaWydatek {
  return {
    Identyfikator: 'WYD-2024-01',
    NumerFaktury: 'FV/2024/001',
    NazwaWydatku: 'Zakup materiałów biurowych',
    DataWystawienia: '2024-08-15',
    TerminPlatnosci: '2024-08-30',
    KwotaNetto23: 100.0,
    KwotaVat23: 23.0,
    KwotaNetto08: 50.0,
    KwotaVat08: 4.0,
    KwotaNetto05: 0,
    KwotaVat05: 0,
    KwotaNetto00: 0,
    Kwota: 0,
    IdentyfikatorKontrahenta: 'KONT-050',
    ...overrides,
  }
}

describe('transformExpense (ifirma)', () => {
  it('maps Identyfikator to id', () => {
    expect(transformExpense(makeExpense()).id).toBe('WYD-2024-01')
  })

  it('falls back to NumerFaktury for id when Identyfikator is undefined', () => {
    const raw = makeExpense()
    delete raw.Identyfikator
    expect(transformExpense(raw).id).toBe('FV/2024/001')
  })

  it('maps NazwaWydatku to name', () => {
    expect(transformExpense(makeExpense()).name).toBe('Zakup materiałów biurowych')
  })

  it('maps IdentyfikatorKontrahenta to contactId', () => {
    expect(transformExpense(makeExpense()).contactId).toBe('KONT-050')
  })

  it('sums all netto and VAT amounts to totalAmount in minor units', () => {
    // netto: 100 + 50 = 150; vat: 23 + 4 = 27; total: 177 PLN → 17700 groszy
    expect(transformExpense(makeExpense()).totalAmount).toBe(17700)
  })

  it('sums VAT amounts for taxAmount in minor units', () => {
    // 23 + 4 = 27 PLN → 2700 groszy
    expect(transformExpense(makeExpense()).taxAmount).toBe(2700)
  })

  it('maps DataWystawienia to postedAt', () => {
    expect(transformExpense(makeExpense()).postedAt).toEqual(new Date('2024-08-15'))
  })

  it('omits taxAmount when no VAT amounts are set', () => {
    const raw = makeExpense({
      KwotaNetto23: 0,
      KwotaVat23: 0,
      KwotaNetto08: 0,
      KwotaVat08: 0,
      KwotaNetto05: 0,
      KwotaVat05: 0,
      Kwota: 200.0,
    })
    const result = transformExpense(raw)
    expect(result.taxAmount).toBeUndefined()
    expect(result.totalAmount).toBe(20000)
  })

  it('produces a schema-valid Expense', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeExpense()))).not.toThrow()
  })

  describe('untransformExpense', () => {
    it('converts totalAmount minor units to PLN netto (subtracting vat)', () => {
      // total: 17700 groszy = 177 PLN; vat: 2700 groszy = 27 PLN; netto = 150 PLN
      const body = untransformExpense({ totalAmount: 17700, taxAmount: 2700 })
      expect(body['KwotaNetto23']).toBe(150)
      expect(body['KwotaVat23']).toBe(27)
    })

    it('maps id to NumerFaktury', () => {
      const body = untransformExpense({ id: 'WYD-001', name: 'test' })
      expect(body['NumerFaktury']).toBe('WYD-001')
    })
  })
})
