import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/tyro/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { DOC_TRANSACTION } from '../fixtures/reporting'

describe('tyro transformCharge (Reporting transaction)', () => {
  it('maps the documented example transaction', () => {
    const c = ChargeSchema.parse(
      transformCharge(DOC_TRANSACTION, { currency: 'AUD', terminalBusinessDay: '2025-05-26' }),
    )
    expect(c.id).toBe(DOC_TRANSACTION.transactionId)
    expect(c.externalId).toBe(DOC_TRANSACTION.transactionId)
    expect(c.amount).toBe(10409)
    expect(c.currency).toBe('AUD')
    expect(c.status).toBe('succeeded')
    expect(c.description).toBeUndefined()
    expect(c.createdAt).toBeUndefined()
    expect(c.gateway).toBe('tyro')
    expect(c.metadata).toMatchObject({
      terminalBusinessDay: '2025-05-26',
      transactionLocalDateTime: '2025-05-26T00:22:06',
      locationId: '122',
      tid: '7',
      paymentType: 'GOODS_AND_SERVICES',
      tyroReference: '990020',
    })
  })

  it.each([
    ['APPROVED', 'succeeded'],
    ['DECLINED', 'failed'],
    ['TIMED_OUT', 'failed'],
    ['CANCELLED', 'cancelled'],
    ['VOIDED', 'cancelled'],
    ['PRE_AUTHORISED', 'pending'],
    ['SOMETHING_NEW', 'unknown'],
  ])('maps transactionStatus %s to %s', (from, to) => {
    const c = ChargeSchema.parse(
      transformCharge({ ...DOC_TRANSACTION, transactionStatus: from }, { currency: 'AUD' }),
    )
    expect(c.status).toBe(to)
  })

  it('maps transactionDescription when the row carries one', () => {
    const c = ChargeSchema.parse(
      transformCharge(
        { ...DOC_TRANSACTION, transactionDescription: 'Table 4' },
        { currency: 'AUD', terminalBusinessDay: '2025-05-26' },
      ),
    )
    expect(c.description).toBe('Table 4')
  })

  it('takes the currency from the connection, uppercased, and never defaults it', () => {
    expect(transformCharge(DOC_TRANSACTION, { currency: 'nzd' }).currency).toBe('NZD')
    expect(() => transformCharge(DOC_TRANSACTION, { currency: '' })).toThrow(/ISO 4217/)
  })

  it('throws rather than inventing an amount or an id', () => {
    expect(() =>
      transformCharge({ ...DOC_TRANSACTION, totalAmount: undefined }, { currency: 'AUD' }),
    ).toThrow(/totalAmount/)
    expect(() =>
      transformCharge({ ...DOC_TRANSACTION, transactionId: '' }, { currency: 'AUD' }),
    ).toThrow(/transactionId/)
  })
})
