import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type LexofficeQuotation,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/order'

function makeQuotation(overrides: Partial<LexofficeQuotation> = {}): LexofficeQuotation {
  return {
    id: 'quote-uuid-001',
    voucherNumber: 'QUO-2024-001',
    voucherDate: '2024-03-01',
    expirationDate: '2024-04-01',
    contactId: 'contact-uuid-001',
    totalAmount: 2000,
    currency: 'EUR',
    voucherStatus: 'open',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id correctly', () => {
    expect(transformOrder(makeQuotation()).id).toBe('quote-uuid-001')
  })

  it('maps contactId correctly', () => {
    expect(transformOrder(makeQuotation()).contactId).toBe('contact-uuid-001')
  })

  it('maps currency correctly', () => {
    expect(transformOrder(makeQuotation()).currency).toBe('EUR')
  })

  it('maps totalAmount correctly', () => {
    expect(transformOrder(makeQuotation()).totalAmount).toBe(2000)
  })

  it('parses voucherDate as Date object for postedAt', () => {
    expect(transformOrder(makeQuotation()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeQuotation()).type).toBe('SALES')
  })

  it('maps voucherStatus accepted to COMPLETED', () => {
    expect(transformOrder(makeQuotation({ voucherStatus: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps voucherStatus rejected to CANCELLED', () => {
    expect(transformOrder(makeQuotation({ voucherStatus: 'rejected' })).status).toBe('CANCELLED')
  })

  it('maps voucherStatus expired to CANCELLED', () => {
    expect(transformOrder(makeQuotation({ voucherStatus: 'expired' })).status).toBe('CANCELLED')
  })

  it('maps voucherStatus draft to ACTIVE (default)', () => {
    expect(transformOrder(makeQuotation({ voucherStatus: 'draft' })).status).toBe('ACTIVE')
  })

  it('maps voucherStatus open to ACTIVE (default)', () => {
    expect(transformOrder(makeQuotation({ voucherStatus: 'open' })).status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeQuotation()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeQuotation())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
