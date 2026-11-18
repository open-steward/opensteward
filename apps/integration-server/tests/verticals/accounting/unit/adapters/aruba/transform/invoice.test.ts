import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ArubaFattura } from '../../../../../../../src/verticals/accounting/adapters/aruba/transform/invoice'

function makeInvoice(overrides: Partial<ArubaFattura> = {}): ArubaFattura {
  return {
    id: 'INV-001',
    numero_documento: 'F/2024/001',
    data_documento: '2024-01-15',
    data_scadenza: '2024-02-15',
    importo_netto: 8000,
    importo_iva: 2000,
    importo_totale: 10000,
    importo_residuo: 10000,
    stato: 'bozza',
    valuta: 'EUR',
    cliente_id: 'CLI-001',
    righe: [],
    ...overrides,
  }
}

describe('transformInvoice (aruba)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('INV-001')
    expect(result.invoiceNumber).toBe('F/2024/001')
    expect(result.contactId).toBe('CLI-001')
    expect(result.totalAmount).toBe(10000)
    expect(result.taxAmount).toBe(2000)
    expect(result.balanceAmount).toBe(10000)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps bozza to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ stato: 'bozza' })).status).toBe('DRAFT')
  })

  it('maps emessa to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ stato: 'emessa' })).status).toBe('AUTHORIZED')
  })

  it('maps pagata to PAID', () => {
    expect(transformInvoice(makeInvoice({ stato: 'pagata' })).status).toBe('PAID')
  })

  it('maps annullata to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ stato: 'annullata' })).status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ stato: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps lineItems correctly', () => {
    const raw = makeInvoice({
      righe: [
        { id: 'R1', descrizione: 'Servizio', quantita: 2, prezzo_unitario: 500, totale: 1000, iva: 220, codice_conto: '3000' },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('R1')
    expect(li.itemDescription).toBe('Servizio')
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(220)
    expect(li.accountId).toBe('3000')
  })

  it('handles undefined righe gracefully', () => {
    const raw = makeInvoice({ righe: undefined })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
