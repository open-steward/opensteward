import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type TinyPedido,
} from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeRaw(overrides: Partial<TinyPedido> = {}): TinyPedido {
  return {
    id: 500,
    numeroPedido: 500,
    situacao: 0,
    data: '2024-04-01T00:00:00.000Z',
    dataCriacao: '2024-03-28T08:00:00.000Z',
    valorTotalPedido: 3000.0,
    cliente: {
      id: 20,
      nome: 'Cliente Gamma',
      endereco: {
        endereco: 'Av. Paulista',
        municipio: 'São Paulo',
        uf: 'SP',
        cep: '01310-200',
      },
    },
    enderecoEntrega: {
      endereco: 'Rua Augusta',
      municipio: 'São Paulo',
      uf: 'SP',
      cep: '01305-000',
    },
    itens: [
      {
        produto: { id: 11, codigo: 'PRD-11', nome: 'Produto Alpha' },
        quantidade: 3,
        valorUnitario: 1000.0,
      },
    ],
    ...overrides,
  }
}

describe('tiny transformOrder', () => {
  it('maps numeric id to string', () => {
    expect(transformOrder(makeRaw()).id).toBe('500')
  })

  it('maps situacao=0 to ACTIVE', () => {
    expect(transformOrder(makeRaw({ situacao: 0 })).status).toBe('ACTIVE')
  })

  it('maps situacao=1 to COMPLETED', () => {
    expect(transformOrder(makeRaw({ situacao: 1 })).status).toBe('COMPLETED')
  })

  it('maps situacao=2 to CANCELLED', () => {
    expect(transformOrder(makeRaw({ situacao: 2 })).status).toBe('CANCELLED')
  })

  it('maps situacao=8 to DRAFT', () => {
    expect(transformOrder(makeRaw({ situacao: 8 })).status).toBe('DRAFT')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeRaw()).type).toBe('SALES')
  })

  it('maps cliente.id to contactId as string', () => {
    expect(transformOrder(makeRaw()).contactId).toBe('20')
  })

  it('maps valorTotalPedido to totalAmount', () => {
    expect(transformOrder(makeRaw()).totalAmount).toBe(3000.0)
  })

  it('falls back to valor string for totalAmount when valorTotalPedido absent', () => {
    const result = transformOrder(makeRaw({ valorTotalPedido: null, valor: '2500.50' }))
    expect(result.totalAmount).toBeCloseTo(2500.5)
  })

  it('maps data to postedAt as Date', () => {
    expect(transformOrder(makeRaw()).postedAt).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })

  it('maps dataCriacao to createdAt as Date', () => {
    expect(transformOrder(makeRaw()).createdAt).toEqual(new Date('2024-03-28T08:00:00.000Z'))
  })

  it('maps enderecoEntrega to shippingAddress', () => {
    const result = transformOrder(makeRaw())
    expect(result.shippingAddress?.address1).toBe('Rua Augusta')
    expect(result.shippingAddress?.city).toBe('São Paulo')
  })

  it('maps itens to lineItems', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Produto Alpha')
    expect(result.lineItems![0].unitQuantity).toBe(3)
  })

  it('passes OrderSchema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrder({})).not.toThrow()
  })
})
