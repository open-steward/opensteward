import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  untransformCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/ifirma/transform/creditmemo'
import type { IfirmaInvoice } from '../../../../../../../src/verticals/accounting/adapters/ifirma/transform/invoice'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

function makeCreditMemo(overrides: Partial<IfirmaInvoice> = {}): IfirmaInvoice {
  return {
    FakturaId: 9001,
    PelnyNumer: 'KOR/2024/001',
    KontrahentNazwa: 'Klient XYZ',
    IdentyfikatorKontrahenta: 'KONT-100',
    NIPKontrahenta: '111-222-33-44',
    DataWystawienia: '2024-09-01',
    TerminPlatnosci: '2024-09-30',
    Brutto: -492.0, // credit memo — negative gross
    Waluta: 'PLN',
    Zaplacono: 0.0,
    Rodzaj: 'KOR',
    CzyWyslano: false,
    Pozycje: [
      {
        NazwaPelna: 'Zwrot usługi',
        Ilosc: 2,
        CenaJednostkowa: 200.0,
        StawkaVat: 23,
        TypStawkiVat: 'PRC',
        Jednostka: 'szt.',
        Rabat: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformCreditMemo (ifirma)', () => {
  it('maps FakturaId to id as string', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('9001')
  })

  it('maps PelnyNumer to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('KOR/2024/001')
  })

  it('maps IdentyfikatorKontrahenta to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('KONT-100')
  })

  it('maps Waluta to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('PLN')
  })

  it('converts abs(Brutto) to minor units for totalAmount', () => {
    // abs(-492.00) → 49200 groszy
    expect(transformCreditMemo(makeCreditMemo({ Brutto: -492.0 })).totalAmount).toBe(49200)
  })

  it('maps fully-paid credit memo to PAID', () => {
    const result = transformCreditMemo(makeCreditMemo({ Brutto: -492.0, Zaplacono: 492.0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partially-paid credit memo to PARTIALLY_PAID', () => {
    const result = transformCreditMemo(makeCreditMemo({ Brutto: -492.0, Zaplacono: 100.0 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps unpaid credit memo to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ Brutto: -492.0, Zaplacono: 0 })).status).toBe(
      'AUTHORIZED',
    )
  })

  it('maps DataWystawienia to postedAt', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-09-01'))
  })

  it('maps TerminPlatnosci to dueAt', () => {
    expect(transformCreditMemo(makeCreditMemo()).dueAt).toEqual(new Date('2024-09-30'))
  })

  it('maps line items correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.itemDescription).toBe('Zwrot usługi')
    // 2 qty × 200 PLN = 400 PLN = 40000 groszy
    expect(li.totalAmount).toBe(40000)
    // tax: 400 × 23% = 92 PLN = 9200 groszy
    expect(li.taxAmount).toBe(9200)
  })

  it('produces a schema-valid CreditMemo', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(makeCreditMemo()))).not.toThrow()
  })

  describe('untransformCreditMemo', () => {
    it('sets PowodKorekty hardcoded to ZWR_SPRZ_TOW', () => {
      expect(untransformCreditMemo({})['PowodKorekty']).toBe('ZWR_SPRZ_TOW')
    })

    it('converts paidAmount minor units to decimal PLN', () => {
      const body = untransformCreditMemo({ paidAmount: 49200 })
      expect(body['Zaplacono']).toBe(492)
    })
  })
})
