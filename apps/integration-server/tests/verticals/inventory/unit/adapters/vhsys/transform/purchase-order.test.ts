import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawVhsysPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/vhsys/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const baseRaw: RawVhsysPurchaseOrder = {
  id_ordem_compra: '100',
  numero_ordem_compra: 'OC-2024-001',
  id_fornecedor: '42',
  nome_fornecedor: 'Keyboards Inc',
  situacao_ordem_compra: 'ENVIADO',
  moeda_ordem_compra: 'BRL',
  valor_total_ordem_compra: 1499,
  valor_subtotal_ordem_compra: 1499,
  id_deposito: '7',
  data_ordem_compra: '2024-03-01T00:00:00Z',
  data_previsao_entrega: '2024-03-15T00:00:00Z',
  itens: [
    {
      id_produto: '1001',
      quantidade: 100,
      quantidade_recebida: 0,
      valor_unitario: 14.99,
      valor_total: 1499,
    },
  ],
}

describe('vhsys transformPurchaseOrder', () => {
  it('maps id from id_ordem_compra', () => {
    expect(transformPurchaseOrder(baseRaw).id).toBe('100')
  })

  it('maps number from numero_ordem_compra', () => {
    expect(transformPurchaseOrder(baseRaw).number).toBe('OC-2024-001')
  })

  it('maps supplierId from id_fornecedor', () => {
    expect(transformPurchaseOrder(baseRaw).supplierId).toBe('42')
  })

  it('maps destinationLocationId from id_deposito', () => {
    expect(transformPurchaseOrder(baseRaw).destinationLocationId).toBe('7')
  })

  it('maps status ENVIADO to sent', () => {
    expect(transformPurchaseOrder(baseRaw).status).toBe('sent')
  })

  it('maps status RASCUNHO to draft', () => {
    expect(transformPurchaseOrder({ ...baseRaw, situacao_ordem_compra: 'RASCUNHO' }).status).toBe(
      'draft',
    )
  })

  it('maps status RECEBIDO to received', () => {
    expect(transformPurchaseOrder({ ...baseRaw, situacao_ordem_compra: 'RECEBIDO' }).status).toBe(
      'received',
    )
  })

  it('maps status CANCELADO to cancelled', () => {
    expect(transformPurchaseOrder({ ...baseRaw, situacao_ordem_compra: 'CANCELADO' }).status).toBe(
      'cancelled',
    )
  })

  it('maps currency from moeda_ordem_compra', () => {
    expect(transformPurchaseOrder(baseRaw).currency).toBe('BRL')
  })

  it('defaults currency to BRL when absent', () => {
    expect(transformPurchaseOrder({ ...baseRaw, moeda_ordem_compra: undefined }).currency).toBe(
      'BRL',
    )
  })

  it('converts total amounts to minor units', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.totalAmount).toBe(149900)
    expect(result.subtotalAmount).toBe(149900)
  })

  it('maps lines with productId and quantityOrdered', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('1001')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
  })

  it('converts line unit cost to minor units', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.lines[0]!.unitCost).toBe(1499)
  })

  it('maps orderedAt from data_ordem_compra', () => {
    expect(transformPurchaseOrder(baseRaw).orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from data_previsao_entrega', () => {
    expect(transformPurchaseOrder(baseRaw).expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('sets platform to vhsys', () => {
    expect(transformPurchaseOrder(baseRaw).platform).toBe('vhsys')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(baseRaw))).not.toThrow()
  })
})
