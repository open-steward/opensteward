import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type VhsysPedidoOrder,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makePedidoOrder(overrides: Partial<VhsysPedidoOrder> = {}): VhsysPedidoOrder {
  return {
    id_pedido: 99,
    numero_pedido: 'ORD-099',
    id_cliente: 12,
    situacao_pedido: 'A',
    valor_total: '6000.00',
    data_pedido: '2024-07-01',
    data_entrega: '2024-07-15',
    moeda_pedido: 'BRL',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makePedidoOrder())
    expect(result.id).toBe('99')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('12')
    expect(result.currency).toBe('BRL')
  })

  it('converts valor_total to minor units', () => {
    const result = transformOrder(makePedidoOrder({ valor_total: '6000.00' }))
    expect(result.totalAmount).toBe(600000)
  })

  it('maps situacao_pedido A to ACTIVE', () => {
    const result = transformOrder(makePedidoOrder({ situacao_pedido: 'A' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps situacao_pedido F to COMPLETED', () => {
    const result = transformOrder(makePedidoOrder({ situacao_pedido: 'F' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps situacao_pedido C to CANCELLED', () => {
    const result = transformOrder(makePedidoOrder({ situacao_pedido: 'C' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('defaults currency to BRL', () => {
    const result = transformOrder(makePedidoOrder({ moeda_pedido: undefined }))
    expect(result.currency).toBe('BRL')
  })

  it('passes raw as metadata', () => {
    const raw = makePedidoOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformOrder(makePedidoOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
