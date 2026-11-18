import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type BmanOrdineAcquisto } from '../../../../../../../src/verticals/accounting/adapters/bman/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<BmanOrdineAcquisto> = {}): BmanOrdineAcquisto {
  return {
    id: 'po-1',
    stato: 'aperto',
    valuta: 'EUR',
    totale: 5000,
    fornitore_id: 'supplier-1',
    data: '2024-01-15',
    righe: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps id field', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('po-1')
  })

  it('maps key fields', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.contactId).toBe('supplier-1')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(5000)
  })

  it('maps stato=aperto to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ stato: 'aperto' })).status).toBe('ACTIVE')
  })

  it('maps stato=ricevuto to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ stato: 'ricevuto' })).status).toBe('COMPLETED')
  })

  it('maps stato=annullato to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ stato: 'annullato' })).status).toBe('CANCELLED')
  })

  it('maps date field as Date object', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps righe to lineItems', () => {
    const raw = makePurchaseOrder({
      righe: [{ id: 'row-1', descrizione: 'Part', quantita: 2, prezzo: 500, totale: 1000, conto: 'ACC-1' }],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(1000)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
