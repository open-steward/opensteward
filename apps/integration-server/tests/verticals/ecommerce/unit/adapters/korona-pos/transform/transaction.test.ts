/**
 * Shape verified against `components.schemas.Receipt` and `ReceiptTotal` on
 * https://128.koronacloud.com/web/api/v3/openapi.json. `amount` is only
 * populated when a real, independently-resolved ISO 4217 currency is
 * passed in — never a fabricated default (see `index.ts#resolveCurrency`).
 */
import { describe, it, expect } from 'vitest'
import {
  transformReceipt,
  type KoronaReceipt,
} from '../../../../../../../src/verticals/ecommerce/adapters/korona-pos/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<KoronaReceipt> = {}): KoronaReceipt {
  return {
    id: '66666666-6666-6666-6666-666666666666',
    number: '2024-0001',
    bookingTime: '2024-03-01T10:00:00+01:00',
    creationTime: '2024-03-01T10:00:01+01:00',
    total: { gross: 37.39 },
    ...overrides,
  }
}

describe('transformReceipt (korona-pos)', () => {
  it('maps id', () => {
    expect(transformReceipt(makeRaw(), 'USD').id).toBe('66666666-6666-6666-6666-666666666666')
  })

  it('maps a non-voided, non-reversal receipt to kind SALE, status SUCCESS', () => {
    const result = transformReceipt(makeRaw(), 'USD')
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps reversal to kind REFUND', () => {
    expect(transformReceipt(makeRaw({ reversal: true }), 'USD').kind).toBe('REFUND')
  })

  it('maps cancelled/voided to the enum\'s own unknown member, not a guessed status', () => {
    expect(transformReceipt(makeRaw({ cancelled: true }), 'USD').status).toBe('unknown')
    expect(transformReceipt(makeRaw({ voided: true }), 'USD').status).toBe('unknown')
  })

  it('converts total.gross to minor units using the resolved currency', () => {
    const result = transformReceipt(makeRaw(), 'USD')
    expect(result.amount).toEqual({ amount: 3739, currency: 'USD' })
  })

  it('never invents a currency — amount is left undefined when none was resolved', () => {
    expect(transformReceipt(makeRaw(), undefined).amount).toBeUndefined()
  })

  it('never invents a currency — amount is left undefined when the resolved value fails ISO 4217 validation', () => {
    expect(transformReceipt(makeRaw(), 'DOLLARS').amount).toBeUndefined()
  })

  it('never invents an orderId — orderNumber is a business number, not a CustomerOrder id', () => {
    expect(transformReceipt(makeRaw(), 'USD').orderId).toBeUndefined()
  })

  it('normalises bookingTime/creationTime to strict ISO UTC', () => {
    const result = transformReceipt(makeRaw(), 'USD')
    expect(result.processedAt).toBe('2024-03-01T09:00:00.000Z')
    expect(result.createdAt).toBe('2024-03-01T09:00:01.000Z')
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    expect(() => TransactionSchema.parse(transformReceipt(makeRaw(), 'USD'))).not.toThrow()
    expect(() => TransactionSchema.parse(transformReceipt(makeRaw(), undefined))).not.toThrow()
  })
})
