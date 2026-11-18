import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type BlingPedidoVenda,
  type BlingPedidoVendaItem,
} from '../../../../../../../src/verticals/accounting/adapters/bling/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeItem(overrides: Partial<BlingPedidoVendaItem> = {}): BlingPedidoVendaItem {
  return {
    id: 1001,
    codigo: 'SKU-A',
    descricao: 'Produto A',
    valor: 25.0,
    quantidade: 4,
    produto: { id: 300 },
    ...overrides,
  }
}

function makeSO(overrides: Partial<BlingPedidoVenda> = {}): BlingPedidoVenda {
  return {
    id: 700,
    situacao: { id: 5, valor: 1 },
    total: 100.0,
    contato: { id: 60, nome: 'Cliente Final' },
    itens: [makeItem()],
    data: '2024-07-15',
    ...overrides,
  }
}

describe('transformSalesOrder (bling)', () => {
  it('maps id to string', () => {
    const result = transformSalesOrder(makeSO({ id: 456 }))
    expect(result.id).toBe('456')
  })

  it('maps situacao.valor=0 to DRAFT', () => {
    expect(transformSalesOrder(makeSO({ situacao: { valor: 0 } })).status).toBe('DRAFT')
  })

  it('maps situacao.valor=1 to ACTIVE', () => {
    expect(transformSalesOrder(makeSO({ situacao: { valor: 1 } })).status).toBe('ACTIVE')
  })

  it('maps situacao.valor=2 to COMPLETED', () => {
    expect(transformSalesOrder(makeSO({ situacao: { valor: 2 } })).status).toBe('COMPLETED')
  })

  it('maps situacao.valor=9 to COMPLETED', () => {
    expect(transformSalesOrder(makeSO({ situacao: { valor: 9 } })).status).toBe('COMPLETED')
  })

  it('maps situacao.valor=4 to CANCELLED', () => {
    expect(transformSalesOrder(makeSO({ situacao: { valor: 4 } })).status).toBe('CANCELLED')
  })

  it('maps unknown situacao.valor to ACTIVE as default', () => {
    expect(transformSalesOrder(makeSO({ situacao: { valor: 7 } })).status).toBe('ACTIVE')
  })

  it('maps situacao=undefined to ACTIVE', () => {
    expect(transformSalesOrder(makeSO({ situacao: undefined })).status).toBe('ACTIVE')
  })

  it('converts total to minor units', () => {
    const result = transformSalesOrder(makeSO({ total: 999.99 }))
    expect(result.totalAmount).toBe(99999)
  })

  it('maps contato.id to contactId as string', () => {
    const result = transformSalesOrder(makeSO({ contato: { id: 88, nome: 'VIP Client' } }))
    expect(result.contactId).toBe('88')
  })

  it('maps lineitem id from item.id', () => {
    const result = transformSalesOrder(
      makeSO({
        itens: [makeItem({ id: 555 })],
      }),
    )
    expect(result.lineItems![0]!.id).toBe('555')
  })

  it('maps lineitem itemId from produto.id when available', () => {
    const result = transformSalesOrder(
      makeSO({
        itens: [makeItem({ produto: { id: 400 }, codigo: 'FALLBACK' })],
      }),
    )
    expect(result.lineItems![0]!.itemId).toBe('400')
  })

  it('falls back to item.codigo as itemId when produto.id is absent', () => {
    const result = transformSalesOrder(
      makeSO({
        itens: [makeItem({ produto: { id: undefined }, codigo: 'CODIGO-X' })],
      }),
    )
    expect(result.lineItems![0]!.itemId).toBe('CODIGO-X')
  })

  it('maps lineitem amounts to minor units', () => {
    const result = transformSalesOrder(
      makeSO({
        itens: [makeItem({ valor: 15.25, quantidade: 3, produto: undefined })],
      }),
    )
    const item = result.lineItems![0]!
    expect(item.unitAmount).toBe(1525)
    expect(item.unitQuantity).toBe(3)
    expect(item.totalAmount).toBe(4575)
  })

  it('maps data to postedAt Date', () => {
    const result = transformSalesOrder(makeSO({ data: '2024-07-15' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('passes raw as metadata', () => {
    const raw = makeSO()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('result passes SalesOrderSchema validation', () => {
    const result = transformSalesOrder(makeSO())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })

  it('result with minimal input passes SalesOrderSchema validation', () => {
    const result = transformSalesOrder({ id: 1 })
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
