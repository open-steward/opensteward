import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type Fatture24Fattura } from '../../../../../../../src/verticals/accounting/adapters/fatture24/transform/invoice'

function makeInvoice(overrides: Partial<Fatture24Fattura> = {}): Fatture24Fattura {
  return {
    id: 'INV-001',
    Numero: 'F/2024/001', DataFattura: '2024-01-15', DataScadenza: '2024-02-15', Netto: 8000, Iva: 2000, Totale: 10000, Residuo: 10000, Stato: 'bozza', Valuta: 'EUR', ClienteId: 'CLI-001', Righe: [],
    ...overrides,
  }
}

describe('transformInvoice (fatture24)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('INV-001')
    expect(result.type).toBe('INVOICE')
    expect(result.totalAmount).toBe(10000)
    expect(result.currency).toBe('EUR')
  })

  it('passes raw object as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('defaults to DRAFT for draft status', () => {
    expect(transformInvoice(makeInvoice()).status).toBe('DRAFT')
  })

  it('maps authorized status correctly', () => {
    // status field overridden below via spread
    const raw = makeInvoice()
    const anyRaw = raw as Record<string, unknown>
    // find the status field key
    const statusKey = Object.keys(anyRaw).find(k => anyRaw[k] === 'bozza')
    if (statusKey) {
      anyRaw[statusKey] = 'emessa'
      expect(transformInvoice(raw).status).toBe('AUTHORIZED')
    }
  })

  it('maps paid status correctly', () => {
    const raw = makeInvoice()
    const anyRaw = raw as Record<string, unknown>
    const statusKey = Object.keys(anyRaw).find(k => anyRaw[k] === 'bozza')
    if (statusKey) {
      anyRaw[statusKey] = 'pagata'
      expect(transformInvoice(raw).status).toBe('PAID')
    }
  })

  it('maps voided status correctly', () => {
    const raw = makeInvoice()
    const anyRaw = raw as Record<string, unknown>
    const statusKey = Object.keys(anyRaw).find(k => anyRaw[k] === 'bozza')
    if (statusKey) {
      anyRaw[statusKey] = 'annullata'
      expect(transformInvoice(raw).status).toBe('VOIDED')
    }
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
