import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ContasimpleInvoice } from '../../../../../../../src/verticals/accounting/adapters/contasimple/transform/invoice'

function makeInvoice(overrides: Partial<ContasimpleInvoice> = {}): ContasimpleInvoice {
  return {
    id: 'inv-001',
    numero: 'F-2024-001',
    fecha: '2024-01-15',
    fecha_vencimiento: '2024-02-15',
    base: 8000,
    iva: 1680,
    total: 9680,
    pendiente: 9680,
    estado: 'borrador',
    cliente_id: 'cli-001',
    moneda: 'EUR',
    lineas: [],
    ...overrides,
  }
}

describe('transformInvoice (contasimple)', () => {
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

  it('maps borrador to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ estado: 'borrador' })).status).toBe('DRAFT')
  })

  it('maps enviada to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ estado: 'enviada' })).status).toBe('AUTHORIZED')
  })

  it('maps pagada to PAID', () => {
    expect(transformInvoice(makeInvoice({ estado: 'pagada' })).status).toBe('PAID')
  })

  it('maps cancelada to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ estado: 'cancelada' })).status).toBe('VOIDED')
  })

  it('maps lineas to lineItems', () => {
    const raw = makeInvoice({
      lineas: [{ id: 1, descripcion: 'Producto X', precio: 200, cantidad: 3, total: 600, iva: 126, cuenta: '705' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.totalAmount).toBe(600)
    expect(li.taxAmount).toBe(126)
  })

  it('handles missing optional fields', () => {
    const result = transformInvoice(makeInvoice({ cliente_id: '', moneda: '' }))
    expect(result.contactId).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
