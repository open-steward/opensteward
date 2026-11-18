import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type VhsysPedidoSales,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makePedidoSales(overrides: Partial<VhsysPedidoSales> = {}): VhsysPedidoSales {
  return {
    id_pedido: 55,
    numero_pedido: 'SO-055',
    id_cliente: 18,
    situacao_pedido: 'A',
    valor_total: '7500.00',
    data_pedido: '2024-09-01',
    data_entrega: '2024-09-15',
    moeda_pedido: 'BRL',
    canal_venda: 'online',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makePedidoSales())
    expect(result.id).toBe('55')
    expect(result.contactId).toBe('18')
    expect(result.currency).toBe('BRL')
    expect(result.salesChannel).toBe('online')
  })

  it('converts valor_total to minor units', () => {
    const result = transformSalesOrder(makePedidoSales({ valor_total: '7500.00' }))
    expect(result.totalAmount).toBe(750000)
  })

  it('maps situacao_pedido A to ACTIVE', () => {
    const result = transformSalesOrder(makePedidoSales({ situacao_pedido: 'A' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps situacao_pedido F to COMPLETED', () => {
    const result = transformSalesOrder(makePedidoSales({ situacao_pedido: 'F' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps situacao_pedido C to CANCELLED', () => {
    const result = transformSalesOrder(makePedidoSales({ situacao_pedido: 'C' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('defaults currency to BRL', () => {
    const result = transformSalesOrder(makePedidoSales({ moeda_pedido: undefined }))
    expect(result.currency).toBe('BRL')
  })

  it('passes raw as metadata', () => {
    const raw = makePedidoSales()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformSalesOrder(makePedidoSales())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
