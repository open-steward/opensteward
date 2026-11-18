import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/tink/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { TRANSACTION } from '../fixtures'

describe('tink transformCharge (documented PAYIN SettlementAccountTransaction)', () => {
  it('maps the documented example transaction', () => {
    const c = ChargeSchema.parse(transformCharge(TRANSACTION))
    expect(c.id).toBe('817465f1-adbf-493b-bf7e-d167c39289ba')
    expect(c.externalId).toBe(c.id)
    // ExactNumber {scale: "2", unscaledValue: "12300"} GBP = 123.00 = 12300 pence
    expect(c.amount).toBe(12300)
    expect(c.currency).toBe('GBP')
    expect(c.status).toBe('succeeded')
    expect(c.description).toBe('Wdr7ad0feabb4ab')
    expect(c.metadata).toEqual({ key1: 'value1', key2: 'value2' })
    expect(c.createdAt).toBe('2021-07-14T14:01:53.000Z')
    expect(c.gateway).toBe('tink')
    expect(c.raw).toBe(TRANSACTION)
  })

  it('leaves undocumented fields unset rather than inventing them', () => {
    const c = ChargeSchema.parse(transformCharge(TRANSACTION))
    expect(c.amountRefunded).toBeUndefined()
    expect(c.customerId).toBeUndefined()
    expect(c.paymentMethodId).toBeUndefined()
  })

  it('throws rather than defaulting a currency', () => {
    expect(() =>
      transformCharge({ ...TRANSACTION, amount: { value: TRANSACTION.amount.value } } as never),
    ).toThrow(/currencyCode/)
  })

  it('throws rather than inventing an amount', () => {
    expect(() =>
      transformCharge({ ...TRANSACTION, amount: { currencyCode: 'GBP' } } as never),
    ).toThrow(/unscaledValue/)
  })

  it('throws rather than inventing an id', () => {
    expect(() => transformCharge({ ...TRANSACTION, id: '' })).toThrow(/missing id/)
  })
})
