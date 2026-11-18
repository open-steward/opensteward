import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type IfirmaInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/ifirma/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<IfirmaInvoice> = {}): IfirmaInvoice {
  return {
    FakturaId: 5001,
    PelnyNumer: 'FV/2024/100',
    KontrahentNazwa: 'Klient Testowy',
    IdentyfikatorKontrahenta: 'KONT-200',
    NIPKontrahenta: '987-654-32-10',
    DataWystawienia: '2024-10-01',
    TerminPlatnosci: '2099-10-31',
    Brutto: 1230.0,
    Waluta: 'PLN',
    Zaplacono: 0.0,
    Rodzaj: 'VAT',
    CzyWyslano: false,
    Pozycje: [
      {
        NazwaPelna: 'Usługa doradcza',
        Ilosc: 3,
        CenaJednostkowa: 333.33,
        StawkaVat: 23,
        TypStawkiVat: 'PRC',
        Jednostka: 'godz.',
        Rabat: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformInvoice (ifirma)', () => {
  it('maps FakturaId to id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('5001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps PelnyNumer to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FV/2024/100')
  })

  it('maps IdentyfikatorKontrahenta to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('KONT-200')
  })

  it('maps Waluta to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('PLN')
  })

  it('converts Brutto decimal PLN to minor units (groszy)', () => {
    // 1230.00 PLN → 123000 groszy
    expect(transformInvoice(makeInvoice({ Brutto: 1230.0 })).totalAmount).toBe(123000)
  })

  it('computes balanceAmount as Brutto - Zaplacono in minor units', () => {
    const result = transformInvoice(makeInvoice({ Brutto: 1230.0, Zaplacono: 300.0 }))
    expect(result.balanceAmount).toBe(93000)
  })

  it('maps fully-paid invoice to PAID', () => {
    const result = transformInvoice(makeInvoice({ Brutto: 1230.0, Zaplacono: 1230.0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partially-paid invoice to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ Brutto: 1230.0, Zaplacono: 615.0 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps past TerminPlatnosci with no payment to OVERDUE', () => {
    const result = transformInvoice(makeInvoice({ TerminPlatnosci: '2000-01-01', Zaplacono: 0 }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps future TerminPlatnosci with no payment to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice()).status).toBe('AUTHORIZED')
  })

  it('maps DataWystawienia to postedAt', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-10-01'))
  })

  it('maps TerminPlatnosci to dueAt', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2099-10-31'))
  })

  it('maps line items with numeric VAT rate', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.itemDescription).toBe('Usługa doradcza')
    expect(li.unitQuantity).toBe(3)
    // tax: (3 × 333.33) × 23% = 999.99 × 0.23 = 229.9977 → toMinorUnits → 22999 or 23000 groszy
    expect(li.taxAmount).toBeGreaterThan(0)
  })

  it('omits taxAmount for string VAT rate (e.g. ZW)', () => {
    const raw = makeInvoice({
      Pozycje: [
        {
          NazwaPelna: 'Usługa zwolniona',
          Ilosc: 1,
          CenaJednostkowa: 100.0,
          StawkaVat: 'ZW',
          TypStawkiVat: 'ZW',
          Jednostka: 'szt.',
          Rabat: 0,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems![0]!.taxAmount).toBeUndefined()
  })

  it('produces a schema-valid Invoice', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('hardcodes StawkaVat to 23 in line items', () => {
      const body = untransformInvoice({
        lineItems: [{ itemDescription: 'Test', unitAmount: 10000, unitQuantity: 1 }],
      })
      const lines = body['Pozycje'] as Array<Record<string, unknown>>
      expect(lines[0]!['StawkaVat']).toBe(23)
    })

    it('maps contactId to IdentyfikatorKontrahenta', () => {
      const body = untransformInvoice({ contactId: 'KONT-200' })
      expect(body['IdentyfikatorKontrahenta']).toBe('KONT-200')
    })

    it('converts paidAmount minor units to PLN decimal', () => {
      const body = untransformInvoice({ paidAmount: 123000 })
      expect(body['Zaplacono']).toBe(1230)
    })
  })
})
