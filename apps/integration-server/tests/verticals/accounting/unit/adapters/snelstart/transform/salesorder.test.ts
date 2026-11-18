import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type SnelStartSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/snelstart/transform/salesorder'

function makeSalesOrder(overrides: Partial<SnelStartSalesOrder> = {}): SnelStartSalesOrder {
  return {
    id: 'snel-so-1',
    ordernummer: '2024SO001',
    relatie: { id: 'relatie-15' },
    valutacode: 'EUR',
    orderdatum: '2024-01-15',
    status: 'actief',
    totaalbedrag: 2420,
    btwBedrag: 420,
    regels: [],
    ...overrides,
  }
}

describe('transformSalesOrder (snelstart)', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('snel-so-1')
  })

  it('maps relatie.id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('relatie-15')
  })

  it('maps totaalbedrag to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(2420)
  })

  it('maps valutacode to currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('maps orderdatum to postedAt as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status gefactureerd to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'gefactureerd' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status geannuleerd to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'geannuleerd' })).status).toBe('CANCELLED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status concept to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'concept' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'actief' })).status).toBe('ACTIVE')
  })

  it('maps regels to lineItems', () => {
    const raw = makeSalesOrder({
      regels: [
        {
          id: 'regel-so-1',
          omschrijving: 'Dienst',
          bedrag: 2000,
          btwBedrag: 420,
          grootboekrekening: { id: '8010' },
          aantal: 1,
          stuksprijs: 2000,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('regel-so-1')
    expect(li.itemDescription).toBe('Dienst')
    expect(li.totalAmount).toBe(2000)
    expect(li.taxAmount).toBe(420)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
