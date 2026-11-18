import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FactusolInvoice } from '../../../../../../../src/verticals/accounting/adapters/factusol/transform/invoice'

function makeInvoice(overrides: Partial<FactusolInvoice> = {}): FactusolInvoice {
  return {
    id: 'inv-001',
    numero: 'F-2024-001',
    fecha: '2024-01-15',
    fecha_cobro: '2024-02-15',
    importe_neto: 8000,
    importe_iva: 1680,
    importe_total: 9680,
    importe_pendiente: 9680,
    estado: 0,
    cliente_id: 'cli-001',
    divisa: 'EUR',
    lineas: [],
    ...overrides,
  }
}

describe('transformInvoice (factusol)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-001')
    expect(result.invoiceNumber).toBe('F-2024-001')
    expect(result.contactId).toBe('cli-001')
    expect(result.totalAmount).toBe(9680)
    expect(result.taxAmount).toBe(1680)
    expect(result.balanceAmount).toBe(9680)
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
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps estado 0 to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ estado: 0 })).status).toBe('DRAFT')
  })

  it('maps estado 1 to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ estado: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps estado 2 to PAID', () => {
    expect(transformInvoice(makeInvoice({ estado: 2 })).status).toBe('PAID')
  })

  it('maps estado 3 to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ estado: 3 })).status).toBe('VOIDED')
  })

  it('maps lineas to lineItems', () => {
    const raw = makeInvoice({
      lineas: [{ id: 1, descripcion: 'Artículo X', precio: 100, cantidad: 5, total: 500, importe_iva: 105, cuenta: '705' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(500)
    expect(result.lineItems![0].taxAmount).toBe(105)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
