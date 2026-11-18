import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type DaneaFattura } from '../../../../../../../src/verticals/accounting/adapters/danea/transform/invoice'

function makeInvoice(overrides: Partial<DaneaFattura> = {}): DaneaFattura {
  return {
    id: '1',
    Numero: 'F/2024/001',
    Data: '2024-01-15',
    Scadenza: '2024-02-15',
    TotaleNetto: 8000,
    TotaleIva: 2000,
    TotaleLordo: 10000,
    TotaleResiduo: 10000,
    Stato: 'Bozza',
    Valuta: 'EUR',
    ClienteId: 'CLI-001',
    Righe: [],
    ...overrides,
  }
}

describe('transformInvoice (danea)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1')
    expect(result.invoiceNumber).toBe('F/2024/001')
    expect(result.contactId).toBe('CLI-001')
    expect(result.totalAmount).toBe(10000)
    expect(result.taxAmount).toBe(2000)
    expect(result.type).toBe('INVOICE')
    expect(result.currency).toBe('EUR')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps Bozza to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ Stato: 'Bozza' })).status).toBe('DRAFT')
  })

  it('maps Emessa to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ Stato: 'Emessa' })).status).toBe('AUTHORIZED')
  })

  it('maps Pagata to PAID', () => {
    expect(transformInvoice(makeInvoice({ Stato: 'Pagata' })).status).toBe('PAID')
  })

  it('maps Annullata to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ Stato: 'Annullata' })).status).toBe('VOIDED')
  })

  it('maps lineItems', () => {
    const raw = makeInvoice({
      Righe: [{ Id: 'R1', Descrizione: 'Consulenza', Quantita: 1, PrezzoUnitario: 1000, Totale: 1000, Iva: 220, CodiceConto: '3100' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('R1')
    expect(result.lineItems![0].totalAmount).toBe(1000)
    expect(result.lineItems![0].taxAmount).toBe(220)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
