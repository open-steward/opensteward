import { describe, it, expect } from 'vitest'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/stark-bank/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'
import { DOC_TRANSFER } from '../fixtures/docs'

describe('stark-bank transformPayout', () => {
  it('maps the documented list example', () => {
    const result = PayoutSchema.parse(transformPayout(DOC_TRANSFER))
    expect(result).toMatchObject({
      id: '5950134772826112',
      externalId: '5950134772826112',
      amount: 1000000,
      currency: 'BRL',
      status: 'in_transit',
      destinationLast4: '5438',
      statementDescriptor: 'Daenerys Targaryen Stormborn (594.739.480-42)',
      gateway: 'stark-bank',
      metadata: { tags: 'daenerys,invoice/1234' },
      createdAt: '2020-04-24T17:49:10.225Z',
      updatedAt: '2020-04-24T17:49:10.225Z',
    })
    expect(result.method).toBeUndefined()
    expect(result.failureCode).toBeUndefined()
  })

  it.each([
    ['created', 'pending'],
    ['processing', 'in_transit'],
    ['success', 'paid'],
    ['failed', 'failed'],
    ['canceled', 'cancelled'],
    ['confirmed', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(PayoutSchema.parse(transformPayout({ ...DOC_TRANSFER, status })).status).toBe(expected)
  })

  it('refuses a record without an id or amount', () => {
    expect(() => transformPayout({ ...DOC_TRANSFER, id: undefined })).toThrow(/no id/)
    expect(() => transformPayout({ ...DOC_TRANSFER, amount: undefined })).toThrow(/no amount/)
  })
})
