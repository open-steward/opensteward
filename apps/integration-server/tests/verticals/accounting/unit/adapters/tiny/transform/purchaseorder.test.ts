import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type TinyOrdemCompra,
} from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makeRaw(overrides: Partial<TinyOrdemCompra> = {}): TinyOrdemCompra {
  return {
    id: 300,
    numero: 'OC-300',
    data: '2024-05-01T00:00:00.000Z',
    situacao: 0,
    totalPedidoCompra: 2000.0,
    contato: {
      id: 30,
      nome: 'Fornecedor Delta',
      endereco: {
        endereco: 'Alameda Santos',
        complemento: 'Bloco A',
        municipio: 'Campinas',
        cep: '13010-000',
        uf: 'SP',
      },
    },
    itens: [
      {
        produto: { id: 5, codigo: 'COMP-5', nome: 'Componente Z' },
        quantidade: 20,
        valorUnitario: 100.0,
      },
    ],
    ...overrides,
  }
}

describe('tiny transformPurchaseOrder', () => {
  it('maps numeric id to string', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('300')
  })

  it('maps situacao=0 to ACTIVE', () => {
    expect(transformPurchaseOrder(makeRaw({ situacao: 0 })).status).toBe('ACTIVE')
  })

  // Tiny's public-api/v3 enum is 0=Em Aberto, 1=Atendido (fulfilled),
  // 2=Cancelado, 3=Em Andamento (in progress). The adapter had 1 and 3
  // swapped, and these tests pinned the swap — so every fulfilled Tiny
  // purchase order reported as still active, and every in-progress one as
  // done. The sibling inventory/tiny-erp adapter maps the same codes
  // correctly (1 -> received, 3 -> sent).
  it('maps situacao=1 (Atendido, fulfilled) to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ situacao: 1 })).status).toBe('COMPLETED')
  })

  it('maps situacao=2 to CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ situacao: 2 })).status).toBe('CANCELLED')
  })

  it('maps situacao=3 (Em Andamento, in progress) to ACTIVE', () => {
    expect(transformPurchaseOrder(makeRaw({ situacao: 3 })).status).toBe('ACTIVE')
  })

  it('accepts the codes as numeric strings, as the API sometimes sends them', () => {
    expect(transformPurchaseOrder(makeRaw({ situacao: '1' as never })).status).toBe('COMPLETED')
    expect(transformPurchaseOrder(makeRaw({ situacao: '3' as never })).status).toBe('ACTIVE')
  })

  it('maps contato.id to contactId as string', () => {
    expect(transformPurchaseOrder(makeRaw()).contactId).toBe('30')
  })

  it('maps totalPedidoCompra to totalAmount', () => {
    expect(transformPurchaseOrder(makeRaw()).totalAmount).toBe(2000.0)
  })

  it('falls back to totalProdutos when totalPedidoCompra absent', () => {
    const result = transformPurchaseOrder(
      makeRaw({ totalPedidoCompra: null, totalProdutos: 1800.0 }),
    )
    expect(result.totalAmount).toBe(1800.0)
  })

  it('maps data to postedAt as Date', () => {
    expect(transformPurchaseOrder(makeRaw()).postedAt).toEqual(new Date('2024-05-01T00:00:00.000Z'))
  })

  it('maps contato.endereco to billingAddress', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.billingAddress?.city).toBe('Campinas')
    expect(result.billingAddress?.region).toBe('SP')
  })

  it('maps itens to lineItems', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Componente Z')
    expect(result.lineItems![0].unitQuantity).toBe(20)
    expect(result.lineItems![0].unitAmount).toBe(100.0)
  })

  it('passes PurchaseOrderSchema validation', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPurchaseOrder({})).not.toThrow()
  })
})
