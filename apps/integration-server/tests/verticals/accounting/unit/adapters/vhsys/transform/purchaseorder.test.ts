import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type VhsysOrdemCompra,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makeOrdemCompra(overrides: Partial<VhsysOrdemCompra> = {}): VhsysOrdemCompra {
  return {
    id_ordem_compra: 44,
    numero_ordem: 'OC-044',
    id_fornecedor: 303,
    situacao: 'A',
    valor_total: '9000.00',
    data_ordem: '2024-08-01',
    moeda: 'BRL',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeOrdemCompra())
    expect(result.id).toBe('44')
    expect(result.contactId).toBe('supp_303')
    expect(result.currency).toBe('BRL')
  })

  it('converts valor_total to minor units', () => {
    const result = transformPurchaseOrder(makeOrdemCompra({ valor_total: '9000.00' }))
    expect(result.totalAmount).toBe(900000)
  })

  it('maps situacao A to ACTIVE', () => {
    const result = transformPurchaseOrder(makeOrdemCompra({ situacao: 'A' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps situacao F to COMPLETED', () => {
    const result = transformPurchaseOrder(makeOrdemCompra({ situacao: 'F' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps situacao C to CANCELLED', () => {
    const result = transformPurchaseOrder(makeOrdemCompra({ situacao: 'C' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('prefixes supplier contactId with supp_', () => {
    const result = transformPurchaseOrder(makeOrdemCompra({ id_fornecedor: 77 }))
    expect(result.contactId).toBe('supp_77')
  })

  it('defaults currency to BRL', () => {
    const result = transformPurchaseOrder(makeOrdemCompra({ moeda: undefined }))
    expect(result.currency).toBe('BRL')
  })

  it('passes raw as metadata', () => {
    const raw = makeOrdemCompra()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformPurchaseOrder(makeOrdemCompra())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
