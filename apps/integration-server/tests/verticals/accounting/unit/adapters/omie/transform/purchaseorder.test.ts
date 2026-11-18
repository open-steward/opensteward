import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type OmiePurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/purchaseorder'

function makeRaw(overrides: Partial<OmiePurchaseOrder> = {}): OmiePurchaseOrder {
  return {
    codigo_pedido: 110,
    numero_pedido: 'PC-110',
    codigo_fornecedor: 14,
    moeda: 'BRL',
    data_pedido: '2024-09-01',
    status: 'ABERTO',
    valor_total: 2500,
    valor_imposto: 250,
    itens: [],
    ...overrides,
  }
}

describe('omie transformPurchaseOrder', () => {
  it('maps codigo_pedido to id as string', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('110')
  })

  it('maps status=RECEBIDO to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'RECEBIDO' })).status).toBe('COMPLETED')
  })

  it('maps status=CANCELADO to CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'CANCELADO' })).status).toBe('CANCELLED')
  })

  it('maps codigo_fornecedor to contactId as string', () => {
    expect(transformPurchaseOrder(makeRaw()).contactId).toBe('14')
  })

  it('maps data_pedido to postedAt as Date', () => {
    expect(transformPurchaseOrder(makeRaw()).postedAt).toEqual(new Date('2024-09-01'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPurchaseOrder(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
