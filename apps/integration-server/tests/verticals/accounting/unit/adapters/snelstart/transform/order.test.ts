import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type SnelStartOrder } from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/order'

function makeOrder(overrides: Partial<SnelStartOrder> = {}): SnelStartOrder {
  return {
    id: 'snel-order-1',
    ordernummer: '2024001',
    relatie: { id: 'relatie-5' },
    valutacode: 'EUR',
    orderdatum: '2024-01-15',
    status: 'actief',
    totaalbedrag: 1210,
    btwBedrag: 210,
    regels: [],
    ...overrides,
  }
}

describe('transformOrder (snelstart)', () => {
  it('maps id', () => {
    expect(transformOrder(makeOrder()).id).toBe('snel-order-1')
  })

  it('maps relatie.id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('relatie-5')
  })

  it('maps totaalbedrag to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1210)
  })

  it('maps valutacode to currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps orderdatum to postedAt as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status gefactureerd to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'gefactureerd' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status geannuleerd to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'geannuleerd' })).status).toBe('CANCELLED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status concept to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'concept' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'actief' })).status).toBe('ACTIVE')
  })

  it('maps regels to lineItems', () => {
    const raw = makeOrder({
      regels: [
        {
          id: 'regel-1',
          omschrijving: 'Widget',
          bedrag: 1000,
          btwBedrag: 210,
          grootboekrekening: { id: '8000' },
          aantal: 2,
          stuksprijs: 500,
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('regel-1')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(210)
    expect(li.accountId).toBe('8000')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
