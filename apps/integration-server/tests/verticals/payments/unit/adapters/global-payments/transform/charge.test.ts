import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/global-payments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { TRANSACTION } from '../fixtures/documented'

describe('global-payments transformCharge (GP-API transaction)', () => {
  it('maps the documented list example', () => {
    const charge = ChargeSchema.parse(transformCharge(TRANSACTION))
    expect(charge.id).toBe('TRN_M2lwGiHmpKsrWAtF8sHX3ouWlbqU0Y')
    expect(charge.externalId).toBe('TRN_M2lwGiHmpKsrWAtF8sHX3ouWlbqU0Y')
    // "always represented in the lowest denomination ... with no decimal point"
    expect(charge.amount).toBe(2000)
    expect(charge.currency).toBe('USD')
    expect(charge.status).toBe('pending')
    expect(charge.captured).toBe(false)
    expect(charge.createdAt).toBe('2026-03-01T05:12:10.808Z')
    expect(charge.updatedAt).toBeUndefined()
    expect(charge.description).toBeUndefined()
    expect(charge.gateway).toBe('global-payments')
    expect(charge.metadata).toEqual({
      type: 'SALE',
      channel: 'CNP',
      reference: 'TRANS-b6467ddc-0e27-4f64-b0b1-ecfaf51946df',
      account_id: 'TRA_1e0a2fdfd79d4013b87d47c4c43882f6',
      account_name: 'Portico_Transaction_Processing',
      batch_id: 'BAT_1234',
    })
  })

  it.each([
    ['FOR_REVIEW', 'pending', undefined],
    ['INITIATED', 'pending', undefined],
    ['PENDING', 'pending', undefined],
    ['PREAUTHORIZED', 'pending', false],
    ['CAPTURED', 'succeeded', true],
    ['FUNDED', 'succeeded', true],
    ['REVERSED', 'cancelled', undefined],
    ['DECLINED', 'failed', undefined],
    ['FAILED', 'failed', undefined],
    ['REJECTED', 'failed', undefined],
    ['SOMETHING_NEW', 'unknown', undefined],
  ])('maps status %s to %s', (status, expected, captured) => {
    const charge = ChargeSchema.parse(transformCharge({ ...TRANSACTION, status }))
    expect(charge.status).toBe(expected)
    expect(charge.captured).toBe(captured)
  })

  it('reads the single-view time_last_updated and description', () => {
    const charge = ChargeSchema.parse(
      transformCharge({
        ...TRANSACTION,
        time_last_updated: '2026-05-03T21:23:39.718Z',
        description: 'SKU#BLK-MED-G123-GUC',
      }),
    )
    expect(charge.updatedAt).toBe('2026-05-03T21:23:39.718Z')
    expect(charge.description).toBe('SKU#BLK-MED-G123-GUC')
  })

  it('throws rather than inventing an amount or a currency', () => {
    const { amount: _a, ...noAmount } = TRANSACTION
    const { currency: _c, ...noCurrency } = TRANSACTION
    expect(() => transformCharge(noAmount)).toThrow(/amount/)
    expect(() => transformCharge({ ...TRANSACTION, amount: '20.00' })).toThrow(/amount/)
    expect(() => transformCharge(noCurrency)).toThrow(/currency/)
  })
})
