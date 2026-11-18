import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type NuvemFiscalOrdemCompra } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/purchaseorder'

function makeRaw(overrides: Partial<NuvemFiscalOrdemCompra> = {}): NuvemFiscalOrdemCompra {
  return {
    id_ordem_compra: 40,
    id_fornecedor: 9,
    nome_fornecedor: 'Fornecedor B',
    moeda: 'BRL',
    valor_total: 1200,
    data_ordem: '2024-08-01',
    status: 'ativo',
    endereco_entrega: '',
    cidade_entrega: '',
    cep_entrega: '',
    pais_entrega: '',
    nossa_referencia: 'REF-NOS',
    sua_referencia: 'REF-DEL',
    itens: [],
    ...overrides,
  }
}

describe('nuvemfiscal transformPurchaseOrder', () => {
  it('maps id_ordem_compra to id as string', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('40')
  })

  it('maps status=recebido to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'recebido' })).status).toBe('COMPLETED')
  })

  it('maps status=cancelado to CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'cancelado' })).status).toBe('CANCELLED')
  })

  it('maps id_fornecedor to contactId as string', () => {
    expect(transformPurchaseOrder(makeRaw()).contactId).toBe('9')
  })

  it('maps data_ordem to postedAt as Date', () => {
    expect(transformPurchaseOrder(makeRaw()).postedAt).toEqual(new Date('2024-08-01'))
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
