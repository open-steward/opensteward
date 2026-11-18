import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawTinyErpOrdemCompra,
  type RawTinyErpOrdemCompraItem,
} from '../../../../../../../src/verticals/inventory/adapters/tiny-erp/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder', () => {
  const baseItems: RawTinyErpOrdemCompraItem[] = [
    {
      produto: { id: 101, sku: 'WK-2026', descricao: 'Wireless Keyboard' },
      quantidade: 10,
      valorUnitario: 49.9,
      quantidadeRecebida: 5,
    },
    {
      produto: { id: 202, sku: 'MS-001', descricao: 'Wireless Mouse' },
      quantidade: 20,
      valorUnitario: 29.9,
      quantidadeRecebida: 0,
    },
  ]

  const baseRaw: RawTinyErpOrdemCompra = {
    id: 999,
    numero: 'OC-2024-001',
    situacao: 3,
    contato: { id: 7, nome: 'Fornecedor Alpha' },
    data: '2024-03-01T00:00:00Z',
    dataEntrega: '2024-04-01T00:00:00Z',
    dataPrevista: '2024-03-25T00:00:00Z',
    totalPedidoCompra: 1097.0,
    totalProdutos: 1100.0,
    desconto: 50.0,
    frete: 47.0,
    itens: baseItems,
  }

  it('maps id and externalId to String(raw.id)', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.id).toBe('999')
    expect(result.externalId).toBe('999')
  })

  it('maps numero to number as string', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.number).toBe('OC-2024-001')
  })

  it('falls back to numeroPedido when numero is absent (the get-by-id shape)', () => {
    const raw: RawTinyErpOrdemCompra = { ...baseRaw, numero: undefined, numeroPedido: 'OC-2024-002' }
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('OC-2024-002')
  })

  it('maps contato.id to supplierId', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.supplierId).toBe('7')
  })

  it('leaves destinationLocationId undefined — Tiny PO responses have no deposito field', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.destinationLocationId).toBeUndefined()
  })

  it('hardcodes currency to "BRL"', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.currency).toBe('BRL')
  })

  it('sets platform to "tiny-erp"', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.platform).toBe('tiny-erp')
  })

  describe('mapStatus', () => {
    it('maps situacao 0 (Em Aberto) to "draft"', () => {
      expect(transformPurchaseOrder({ ...baseRaw, situacao: 0 }).status).toBe('draft')
    })

    it('maps situacao 3 (Em Andamento) to "sent"', () => {
      expect(transformPurchaseOrder({ ...baseRaw, situacao: 3 }).status).toBe('sent')
    })

    it('maps situacao 1 (Atendido) to "received"', () => {
      expect(transformPurchaseOrder({ ...baseRaw, situacao: 1 }).status).toBe('received')
    })

    it('maps situacao 2 (Cancelado) to "cancelled"', () => {
      expect(transformPurchaseOrder({ ...baseRaw, situacao: 2 }).status).toBe('cancelled')
    })

    it('accepts situacao as a numeric string', () => {
      expect(transformPurchaseOrder({ ...baseRaw, situacao: '2' }).status).toBe('cancelled')
    })

    it('defaults an unknown situacao to "draft"', () => {
      expect(transformPurchaseOrder({ ...baseRaw, situacao: 9 }).status).toBe('draft')
    })

    it('defaults missing situacao to "draft"', () => {
      expect(transformPurchaseOrder({ ...baseRaw, situacao: undefined }).status).toBe('draft')
    })

    it('no longer recognizes the old P/A/F/C letter codes — every letter now falls through to "draft"', () => {
      // Regression guard: before the fix, 'A' mapped to 'sent' and 'F' to 'received'.
      // situacao is numeric now, so letter codes must not silently resolve to anything else.
      expect(transformPurchaseOrder({ ...baseRaw, situacao: 'A' as unknown as number }).status).toBe(
        'draft',
      )
      expect(transformPurchaseOrder({ ...baseRaw, situacao: 'F' as unknown as number }).status).toBe(
        'draft',
      )
    })
  })

  describe('money conversion', () => {
    it('converts totalPedidoCompra to integer minor units (centavos) as totalAmount', () => {
      const result = transformPurchaseOrder(baseRaw)
      // 1097.00 BRL → 109700 centavos
      expect(result.totalAmount).toBe(109700)
    })

    it('converts totalProdutos to integer minor units (centavos) as subtotalAmount', () => {
      const result = transformPurchaseOrder(baseRaw)
      // 1100.00 BRL → 110000 centavos
      expect(result.subtotalAmount).toBe(110000)
    })

    it('records desconto and frete in metadata', () => {
      const result = transformPurchaseOrder(baseRaw)
      expect(result.metadata.desconto).toBe('50')
      expect(result.metadata.frete).toBe('47')
    })
  })

  describe('line items', () => {
    it('maps product id to productId string', () => {
      const result = transformPurchaseOrder(baseRaw)
      expect(result.lines[0]!.productId).toBe('101')
    })

    it('maps quantidade to quantityOrdered', () => {
      const result = transformPurchaseOrder(baseRaw)
      expect(result.lines[0]!.quantityOrdered).toBe(10)
    })

    it('maps quantidadeRecebida to quantityReceived', () => {
      const result = transformPurchaseOrder(baseRaw)
      expect(result.lines[0]!.quantityReceived).toBe(5)
    })

    it('converts valorUnitario to minor units for unitCost', () => {
      const result = transformPurchaseOrder(baseRaw)
      // 49.90 BRL → 4990 centavos
      expect(result.lines[0]!.unitCost).toBe(4990)
    })

    it('computes lineTotal as toMinorUnits(quantidade * valorUnitario)', () => {
      const result = transformPurchaseOrder(baseRaw)
      // 10 * 49.90 = 499.0 → 49900 centavos
      expect(result.lines[0]!.lineTotal).toBe(49900)
    })

    it('emits one line per item', () => {
      const result = transformPurchaseOrder(baseRaw)
      expect(result.lines).toHaveLength(2)
    })

    it('returns empty lines array when itens is absent', () => {
      const raw: RawTinyErpOrdemCompra = { id: 1 }
      const result = transformPurchaseOrder(raw)
      expect(result.lines).toEqual([])
    })
  })

  it('maps dataPrevista to expectedAt (preferred over dataEntrega)', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.expectedAt).toBe('2024-03-25T00:00:00.000Z')
  })

  it('falls back to dataEntrega for expectedAt when dataPrevista is absent', () => {
    const raw: RawTinyErpOrdemCompra = {
      ...baseRaw,
      dataPrevista: undefined,
      dataEntrega: '2024-04-01T00:00:00Z',
    }
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('maps data to orderedAt as ISO string', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets supplierId to empty string when contato is absent', () => {
    const raw: RawTinyErpOrdemCompra = { id: 1 }
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('')
  })

  it('passes PurchaseOrderSchema validation', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
