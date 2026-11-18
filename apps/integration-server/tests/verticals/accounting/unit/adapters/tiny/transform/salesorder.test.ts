import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type TinyPedido,
} from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeRaw(overrides: Partial<TinyPedido> = {}): TinyPedido {
  return {
    id: 600,
    numeroPedido: 600,
    situacao: 0,
    data: '2024-06-01T00:00:00.000Z',
    dataCriacao: '2024-05-30T07:00:00.000Z',
    valorTotalPedido: 7500.0,
    cliente: {
      id: 25,
      nome: 'Cliente Epsilon',
      endereco: {
        endereco: 'Rua do Comércio',
        municipio: 'Belo Horizonte',
        uf: 'MG',
        cep: '30140-000',
      },
    },
    enderecoEntrega: {
      endereco: 'Av. do Contorno',
      municipio: 'Belo Horizonte',
      uf: 'MG',
      cep: '30110-090',
    },
    itens: [
      {
        produto: { id: 9, codigo: 'PRD-9', nome: 'Produto Omega' },
        quantidade: 5,
        valorUnitario: 1500.0,
        infoAdicional: 'Entrega especial',
      },
    ],
    ...overrides,
  }
}

describe('tiny transformSalesOrder', () => {
  it('maps numeric id to string', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('600')
  })

  it('maps situacao=0 to ACTIVE', () => {
    expect(transformSalesOrder(makeRaw({ situacao: 0 })).status).toBe('ACTIVE')
  })

  it('maps situacao=2 to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ situacao: 2 })).status).toBe('CANCELLED')
  })

  it('maps situacao=1 to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ situacao: 1 })).status).toBe('COMPLETED')
  })

  it('maps situacao=6 to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ situacao: 6 })).status).toBe('COMPLETED')
  })

  it('maps situacao=8 to DRAFT', () => {
    expect(transformSalesOrder(makeRaw({ situacao: 8 })).status).toBe('DRAFT')
  })

  it('maps cliente.id to contactId as string', () => {
    expect(transformSalesOrder(makeRaw()).contactId).toBe('25')
  })

  it('maps valorTotalPedido to totalAmount', () => {
    expect(transformSalesOrder(makeRaw()).totalAmount).toBe(7500.0)
  })

  it('maps data to postedAt as Date', () => {
    expect(transformSalesOrder(makeRaw()).postedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('maps dataCriacao to createdAt as Date', () => {
    expect(transformSalesOrder(makeRaw()).createdAt).toEqual(new Date('2024-05-30T07:00:00.000Z'))
  })

  it('maps enderecoEntrega to shippingAddress', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.shippingAddress?.address1).toBe('Av. do Contorno')
    expect(result.shippingAddress?.city).toBe('Belo Horizonte')
  })

  it('maps itens to lineItems including notes', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Produto Omega')
    expect(result.lineItems![0].notes).toBe('Entrega especial')
  })

  it('passes SalesOrderSchema validation', () => {
    expect(() => SalesOrderSchema.parse(transformSalesOrder(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformSalesOrder({})).not.toThrow()
  })
})
