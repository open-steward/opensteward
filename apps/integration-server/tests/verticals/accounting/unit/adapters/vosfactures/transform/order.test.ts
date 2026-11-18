import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/order'
import type { VosFacturesInvoice } from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/invoice'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeOrderRaw(overrides: Partial<VosFacturesInvoice> = {}): VosFacturesInvoice {
  return {
    id: 4004,
    number: 'CO/2024/004',
    kind: 'client_order',
    status: 'issued',
    income: '1',
    issue_date: '2024-08-10',
    payment_to: '2024-09-10',
    currency: 'PLN',
    price_gross: '1000.00',
    price_net: '813.01',
    client_id: 88,
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrderRaw())
    expect(result.id).toBe('4004')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('88')
    expect(result.currency).toBe('PLN')
    expect(result.totalAmount).toBe(1000)
  })

  it('maps status issued to DRAFT', () => {
    const result = transformOrder(makeOrderRaw({ status: 'issued' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status paid to COMPLETED', () => {
    const result = transformOrder(makeOrderRaw({ status: 'paid' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps status rejected to CANCELLED', () => {
    const result = transformOrder(makeOrderRaw({ status: 'rejected' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status sent to ACTIVE', () => {
    const result = transformOrder(makeOrderRaw({ status: 'sent' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('parses issue_date as postedAt', () => {
    const result = transformOrder(makeOrderRaw())
    expect(result.postedAt).toEqual(new Date('2024-08-10'))
  })

  it('passes raw as metadata', () => {
    const raw = makeOrderRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformOrder(makeOrderRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
