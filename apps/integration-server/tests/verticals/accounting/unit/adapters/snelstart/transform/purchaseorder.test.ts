import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type SnelStartPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<SnelStartPurchaseOrder> = {}): SnelStartPurchaseOrder {
  return {
    id: 'snel-po-1',
    ordernummer: '2024PO001',
    relatie: { id: 'relatie-8' },
    valutacode: 'EUR',
    orderdatum: '2024-01-15',
    status: 'actief',
    totaalbedrag: 605,
    btwBedrag: 105,
    regels: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (snelstart)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('snel-po-1')
  })

  it('maps relatie.id to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('relatie-8')
  })

  it('maps totaalbedrag to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(605)
  })

  it('maps valutacode to currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('maps orderdatum to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status ontvangen to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'ontvangen' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status geannuleerd to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'geannuleerd' })).status).toBe('CANCELLED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status concept to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'concept' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'actief' })).status).toBe('ACTIVE')
  })

  it('maps regels to lineItems', () => {
    const raw = makePurchaseOrder({
      regels: [
        {
          id: 'regel-po-1',
          omschrijving: 'Staal',
          bedrag: 500,
          btwBedrag: 105,
          grootboekrekening: { id: '7000' },
          aantal: 10,
          stuksprijs: 50,
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('regel-po-1')
    expect(li.itemDescription).toBe('Staal')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(105)
    expect(li.accountId).toBe('7000')
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
