import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type OmieSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/salesorder'

function makeRaw(overrides: Partial<OmieSalesOrder> = {}): OmieSalesOrder {
  return {
    codigo_pedido: 120,
    numero_pedido: 'VD-120',
    codigo_cliente: 16,
    moeda: 'BRL',
    data_pedido: '2024-10-05',
    status: 'ABERTO',
    valor_total: 900,
    valor_imposto: 90,
    itens: [],
    ...overrides,
  }
}

describe('omie transformSalesOrder', () => {
  it('maps codigo_pedido to id as string', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('120')
  })

  it('maps status=FATURADO to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'FATURADO' })).status).toBe('COMPLETED')
  })

  it('maps status=CANCELADO to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'CANCELADO' })).status).toBe('CANCELLED')
  })

  it('maps codigo_cliente to contactId as string', () => {
    expect(transformSalesOrder(makeRaw()).contactId).toBe('16')
  })

  it('maps data_pedido to postedAt as Date', () => {
    expect(transformSalesOrder(makeRaw()).postedAt).toEqual(new Date('2024-10-05'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformSalesOrder(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
