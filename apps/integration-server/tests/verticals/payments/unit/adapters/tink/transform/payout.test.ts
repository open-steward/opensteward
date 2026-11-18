import { describe, it, expect } from 'vitest'
import { transformPayout } from '../../../../../../../src/verticals/payments/adapters/tink/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'
import { TRANSACTION } from '../fixtures'

const SWEEP = { ...TRANSACTION, type: 'SWEEP' }

describe('tink transformPayout (SWEEP SettlementAccountTransaction)', () => {
  it('maps the documented transaction shape as an executed sweep', () => {
    const p = PayoutSchema.parse(transformPayout(SWEEP))
    expect(p.id).toBe(TRANSACTION.id)
    expect(p.externalId).toBe(p.id)
    expect(p.amount).toBe(12300)
    expect(p.currency).toBe('GBP')
    expect(p.status).toBe('paid')
    expect(p.statementDescriptor).toBe('Wdr7ad0feabb4ab')
    expect(p.createdAt).toBe('2021-07-14T14:01:53.000Z')
    expect(p.metadata).toEqual({ key1: 'value1', key2: 'value2' })
    expect(p.gateway).toBe('tink')
    expect(p.arrivalDate).toBeUndefined()
  })

  it('passes a negative amount through unchanged (the sign is undocumented)', () => {
    const p = transformPayout({
      ...SWEEP,
      amount: { currencyCode: 'GBP', value: { scale: '2', unscaledValue: '-12300' } },
    })
    expect(PayoutSchema.parse(p).amount).toBe(-12300)
  })

  it('throws rather than defaulting a currency', () => {
    expect(() =>
      transformPayout({ ...SWEEP, amount: { value: SWEEP.amount.value } } as never),
    ).toThrow(/currencyCode/)
  })
})
