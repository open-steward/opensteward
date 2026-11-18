import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type ContaAzulPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<ContaAzulPurchaseOrder> = {}): ContaAzulPurchaseOrder {
  return {
    id: 'po-001',
    supplier_id: 'sup-200',
    currency: 'BRL',
    total: 9500,
    date: '2025-02-20',
    status: 'completed',
    delivery_address: 'Rua Industrial 100',
    delivery_city: 'Campinas',
    delivery_state: 'SP',
    delivery_postal_code: '13000-000',
    delivery_country: 'BR',
    items: [
      { id: 'li-1', description: 'Materia prima', quantity: 20, unit_price: 475, total: 9500, tax_amount: 1710, product_id: 'mp-1', account_id: 'acc-40' },
    ],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('po-001')
    expect(result.contactId).toBe('sup-200')
    expect(result.currency).toBe('BRL')
    expect(result.totalAmount).toBe(9500)
  })

  it('maps status values', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe('COMPLETED')
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps shipping address from delivery fields', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.shippingAddress?.city).toBe('Campinas')
    expect(result.shippingAddress?.region).toBe('SP')
  })

  it('returns undefined shipping when empty', () => {
    const result = transformPurchaseOrder(makePurchaseOrder({ delivery_address: '', delivery_city: '' }))
    expect(result.shippingAddress).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
