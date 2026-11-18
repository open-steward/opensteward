import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AnfixInvoice } from '../../../../../../../src/verticals/accounting/adapters/anfix/transform/invoice'

function makeInvoice(overrides: Partial<AnfixInvoice> = {}): AnfixInvoice {
  return {
    id: 'inv-001',
    numero_factura: 'F-2024-001',
    fecha_factura: '2024-01-15',
    fecha_vencimiento: '2024-02-15',
    base_imponible: 8000,
    cuota_iva: 1680,
    total_factura: 9680,
    pendiente: 9680,
    estado: 'borrador',
    cliente_id: 'cli-001',
    divisa: 'EUR',
    lineas: [],
    ...overrides,
  }
}

describe('transformInvoice (anfix)', () => {
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
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps borrador to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ estado: 'borrador' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps emitida to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ estado: 'emitida' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps cobrada to PAID', () => {
    const result = transformInvoice(makeInvoice({ estado: 'cobrada' }))
    expect(result.status).toBe('PAID')
  })

  it('maps anulada to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ estado: 'anulada' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ estado: 'unknown' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps lineas to lineItems', () => {
    const raw = makeInvoice({
      lineas: [
        {
          id: 1,
          descripcion: 'Servicio A',
          precio: 100,
          cantidad: 5,
          total: 500,
          iva: 105,
          cuenta: '705',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Servicio A')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(105)
    expect(li.accountId).toBe('705')
  })

  it('handles missing optional fields', () => {
    const result = transformInvoice(makeInvoice({ cliente_id: '', divisa: '' }))
    expect(result.contactId).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
