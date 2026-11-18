import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawBlingPedidoCompra,
} from '../../../../../../../src/verticals/inventory/adapters/bling/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('bling transformPurchaseOrder', () => {
  const raw: RawBlingPedidoCompra = {
    id: 555,
    numero: 1042,
    data: '2024-03-01T00:00:00Z',
    dataPrevista: '2024-03-01T00:00:00Z',
    totalProdutos: 500.0,
    total: 550.0,
    fornecedor: { id: 200 },
    situacao: { valor: 6 },
    itens: [
      {
        descricao: 'Teclado Sem Fio',
        valor: 100.0,
        quantidade: 5,
        produto: { id: 9876, codigo: 'TEC-SW-001' },
      },
    ],
    observacoes: 'Urgente',
  }

  it('maps id as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('555')
    expect(result.externalId).toBe('555')
  })

  it('maps number from numero', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('1042')
  })

  it('maps supplierId from fornecedor.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('200')
  })

  it('maps situacao 6 to draft', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('draft')
  })

  it('maps situacao 7 to received', () => {
    const result = transformPurchaseOrder({ ...raw, situacao: { valor: 7 } })
    expect(result.status).toBe('received')
  })

  it('maps situacao 9 to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, situacao: { valor: 9 } })
    expect(result.status).toBe('cancelled')
  })

  it('converts total BRL float to centavos minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(55000)
  })

  it('converts totalProdutos to centavos minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(50000)
  })

  it('sets currency to BRL', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('BRL')
  })

  it('maps line items with productId, quantity and unit cost', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('9876')
    expect(result.lines[0]!.quantityOrdered).toBe(5)
    expect(result.lines[0]!.unitCost).toBe(10000)
    expect(result.lines[0]!.lineTotal).toBe(50000)
  })

  it('maps orderedAt from data', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to bling', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('bling')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
