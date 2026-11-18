/**
 * Fixture: the "Listado de pagos" example response
 * (https://documents.openpay.co/docs/api/index.html#pagos-o-retiros).
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawOpenpayPayout,
} from '../../../../../../../src/verticals/payments/adapters/openpay/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const DOC: RawOpenpayPayout = {
  id: 'tr4f2atubqchinw71vfs',
  amount: 10.5,
  authorization: 'TR4F2ATUBQCHINW71VFS',
  method: 'bank_account',
  operation_type: 'out',
  transaction_type: 'payout',
  status: 'completed',
  currency: 'MXN',
  creation_date: '2014-05-26T17:23:03-05:00',
  operation_date: '2014-05-26T17:26:27-05:00',
  description: 'Retiro de saldo semanal',
  error_message: null,
  order_id: 'oid-1110011',
  bank_account: {
    clabe: '012XXXXXXXXXX24616',
    bank_code: '012',
    bank_name: 'BANCOMER',
    alias: null,
    holder_name: 'Mi empresa',
  },
  customer_id: 'asynwirguzkgq2bizogo',
}

describe('openpay transformPayout', () => {
  it('maps the documented payout transaction', () => {
    const r = PayoutSchema.parse(transformPayout(DOC))
    expect(r.id).toBe('tr4f2atubqchinw71vfs')
    expect(r.amount).toBe(1050)
    expect(r.currency).toBe('MXN')
    expect(r.status).toBe('paid')
    expect(r.statementDescriptor).toBe('Retiro de saldo semanal')
    expect(r.createdAt).toBe('2014-05-26T17:23:03-05:00')
    expect(r.metadata).toEqual({ order_id: 'oid-1110011', customer_id: 'asynwirguzkgq2bizogo' })
  })

  it.each([
    ['in_progress', 'pending'],
    ['failed', 'failed'],
    // Only completed, in_progress and failed are documented transaction statuses.
    ['cancelled', 'unknown'],
    ['odd', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(PayoutSchema.parse(transformPayout({ ...DOC, status })).status).toBe(expected)
  })

  it('never defaults a missing currency', () => {
    const { currency: _c, ...rest } = DOC
    expect(() => transformPayout(rest)).toThrow(/no currency/)
  })

  it('carries error_message as failureMessage', () => {
    const r = PayoutSchema.parse(
      transformPayout({ ...DOC, status: 'failed', error_message: 'Cuenta inválida' }),
    )
    expect(r.failureMessage).toBe('Cuenta inválida')
  })

  it('never defaults a missing id or amount', () => {
    const { id: _i, ...noId } = DOC
    expect(() => transformPayout(noId)).toThrow(/no id/)
    const { amount: _a, ...noAmount } = DOC
    expect(() => transformPayout(noAmount)).toThrow(/no numeric amount/)
  })
})
