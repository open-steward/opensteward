import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type BmanOrdine } from '../../../../../../../src/verticals/accounting/adapters/bman/transform/order'

function makeOrder(overrides: Partial<BmanOrdine> = {}): BmanOrdine {
  return {
    id: 'ord-1',
    stato: 'aperto',
    valuta: 'EUR',
    totale: 5000,
    cliente_id: 'customer-1',
    data: '2024-01-15',
    righe: [],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id field', () => {
    expect(transformOrder(makeOrder()).id).toBe('ord-1')
  })

  it('maps key fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.contactId).toBe('customer-1')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(5000)
    expect(result.type).toBe('SALES')
  })

  it('maps stato=aperto to ACTIVE', () => {
    expect(transformOrder(makeOrder({ stato: 'aperto' })).status).toBe('ACTIVE')
  })

  it('maps stato=completato to COMPLETED', () => {
    expect(transformOrder(makeOrder({ stato: 'completato' })).status).toBe('COMPLETED')
  })

  it('maps stato=annullato to CANCELLED', () => {
    expect(transformOrder(makeOrder({ stato: 'annullato' })).status).toBe('CANCELLED')
  })

  it('maps date field as Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps righe to lineItems', () => {
    const raw = makeOrder({
      righe: [{ id: 'row-1', descrizione: 'Widget', quantita: 3, prezzo: 100, totale: 300, conto: 'ACC-1' }],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('row-1')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(300)
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
