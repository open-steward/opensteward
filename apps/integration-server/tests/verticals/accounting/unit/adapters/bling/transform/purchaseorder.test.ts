import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type BlingPedidoCompra,
  type BlingPedidoCompraItem,
} from '../../../../../../../src/verticals/accounting/adapters/bling/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makeItem(overrides: Partial<BlingPedidoCompraItem> = {}): BlingPedidoCompraItem {
  return {
    descricao: 'Caneta BIC',
    codigoFornecedor: 'FOR-SKU-99',
    valor: 5.0,
    quantidade: 10,
    produto: { id: 200, codigo: 'INT-200' },
    ...overrides,
  }
}

function makePO(overrides: Partial<BlingPedidoCompra> = {}): BlingPedidoCompra {
  return {
    id: 300,
    situacao: { id: 10, valor: 1 },
    total: 50.0,
    fornecedor: { id: 40, nome: 'Fornecedor ABC' },
    itens: [makeItem()],
    data: '2024-06-01',
    ...overrides,
  }
}

describe('transformPurchaseOrder (bling)', () => {
  it('maps id to string', () => {
    const result = transformPurchaseOrder(makePO({ id: 1234 }))
    expect(result.id).toBe('1234')
  })

  it('maps situacao.valor=0 to DRAFT', () => {
    expect(transformPurchaseOrder(makePO({ situacao: { valor: 0 } })).status).toBe('DRAFT')
  })

  it('maps situacao.valor=1 to ACTIVE', () => {
    expect(transformPurchaseOrder(makePO({ situacao: { valor: 1 } })).status).toBe('ACTIVE')
  })

  it('maps situacao.valor=2 to COMPLETED', () => {
    expect(transformPurchaseOrder(makePO({ situacao: { valor: 2 } })).status).toBe('COMPLETED')
  })

  it('maps situacao.valor=9 to COMPLETED', () => {
    expect(transformPurchaseOrder(makePO({ situacao: { valor: 9 } })).status).toBe('COMPLETED')
  })

  it('maps situacao.valor=4 to CANCELLED', () => {
    expect(transformPurchaseOrder(makePO({ situacao: { valor: 4 } })).status).toBe('CANCELLED')
  })

  it('maps unknown situacao.valor to ACTIVE as default', () => {
    expect(transformPurchaseOrder(makePO({ situacao: { valor: 99 } })).status).toBe('ACTIVE')
  })

  it('maps situacao=undefined to ACTIVE', () => {
    expect(transformPurchaseOrder(makePO({ situacao: undefined })).status).toBe('ACTIVE')
  })

  it('converts total to minor units', () => {
    const result = transformPurchaseOrder(makePO({ total: 1234.56 }))
    expect(result.totalAmount).toBe(123456)
  })

  it('maps fornecedor.id to contactId as string', () => {
    const result = transformPurchaseOrder(makePO({ fornecedor: { id: 77, nome: 'Supridores' } }))
    expect(result.contactId).toBe('77')
  })

  it('maps itens to lineItems using produto.id as itemId when available', () => {
    const result = transformPurchaseOrder(
      makePO({
        itens: [makeItem({ produto: { id: 500, codigo: 'X' }, codigoFornecedor: 'FOR-X' })],
      }),
    )
    expect(result.lineItems![0]!.itemId).toBe('500')
  })

  it('falls back to codigoFornecedor as itemId when produto.id is absent', () => {
    const result = transformPurchaseOrder(
      makePO({
        itens: [makeItem({ produto: { id: undefined }, codigoFornecedor: 'FOR-FALLBACK' })],
      }),
    )
    expect(result.lineItems![0]!.itemId).toBe('FOR-FALLBACK')
  })

  it('maps lineitem amounts to minor units', () => {
    const result = transformPurchaseOrder(
      makePO({
        itens: [makeItem({ valor: 10.5, quantidade: 4, produto: undefined })],
      }),
    )
    const item = result.lineItems![0]!
    expect(item.unitAmount).toBe(1050)
    expect(item.unitQuantity).toBe(4)
    expect(item.totalAmount).toBe(4200)
  })

  it('maps data to postedAt Date', () => {
    const result = transformPurchaseOrder(makePO({ data: '2024-06-01' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('passes raw as metadata', () => {
    const raw = makePO()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('result passes PurchaseOrderSchema validation', () => {
    const result = transformPurchaseOrder(makePO())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })

  it('result with minimal input passes PurchaseOrderSchema validation', () => {
    const result = transformPurchaseOrder({ id: 1 })
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
