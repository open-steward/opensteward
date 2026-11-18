import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type XubioSalesOrder,
  type XubioSalesOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/salesorder'

function makeLine(overrides: Partial<XubioSalesOrderLine> = {}): XubioSalesOrderLine {
  return {
    id: 1,
    productoId: 'PROD-B',
    descripcion: 'Product B',
    cantidad: 3,
    precioUnitario: 500,
    total: 1500,
    impuesto: 315,
    cuentaId: 'acc-3000',
    descuento: 0,
    ...overrides,
  }
}

function makeSalesOrder(overrides: Partial<XubioSalesOrder> = {}): XubioSalesOrder {
  return {
    id: 99,
    numero: 'OV-001',
    clienteId: 20,
    moneda: 'ARS',
    fechaEmision: '2024-01-15',
    estado: 'activo',
    total: 1500,
    impuestos: 315,
    lineas: [makeLine()],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id as string', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('99')
  })

  it('maps clienteId to contactId as string', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('20')
  })

  it('maps moneda to currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.currency).toBe('ARS')
  })

  it('maps total to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(1500)
  })

  it('parses fechaEmision as postedAt Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps estado activo to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'activo' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps estado completado to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'completado' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps estado facturado to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'facturado' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps estado cancelado to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'cancelado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps estado anulado to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'anulado' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps estado borrador to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ estado: 'borrador' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps lineas to lineItems', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('PROD-B')
    expect(li.itemDescription).toBe('Product B')
    expect(li.unitQuantity).toBe(3)
    expect(li.unitAmount).toBe(500)
    expect(li.totalAmount).toBe(1500)
    expect(li.taxAmount).toBe(315)
    expect(li.accountId).toBe('acc-3000')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
