import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawTabbyPayment,
  type RawTabbyBuyer,
  type RawTabbyCapture,
  type RawTabbyRefundEntry,
} from '../../../../../../../src/verticals/payments/adapters/tabby/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

function makeRaw(overrides: Partial<RawTabbyPayment> = {}): RawTabbyPayment {
  return {
    id: 'tab-pay-001',
    status: 'CLOSED',
    amount: '330.00',
    currency: 'AED',
    created_at: '2026-01-15T09:30:00Z',
    buyer: { name: 'Jane Doe', email: 'jane@example.com', phone: '+97150000001' },
    ...overrides,
  }
}

describe('transformCharge (tabby)', () => {
  it('maps id from raw id', () => {
    expect(transformCharge(makeRaw()).id).toBe('tab-pay-001')
  })

  it('converts decimal string amount to minor units ("330.00" AED → 33000)', () => {
    expect(transformCharge(makeRaw({ amount: '330.00', currency: 'AED' })).amount).toBe(33000)
  })

  it('converts SAR amount correctly ("100.00" SAR → 10000)', () => {
    expect(transformCharge(makeRaw({ amount: '100.00', currency: 'SAR' })).amount).toBe(10000)
  })

  it('converts KWD amount with 3 decimal places ("10.000" KWD → 10000)', () => {
    expect(transformCharge(makeRaw({ amount: '10.000', currency: 'KWD' })).amount).toBe(10000)
  })

  it('defaults currency to AED when missing', () => {
    expect(transformCharge(makeRaw({ currency: undefined })).currency).toBe('AED')
  })

  it('sets gateway to tabby', () => {
    expect(transformCharge(makeRaw()).gateway).toBe('tabby')
  })

  it('maps receiptEmail from buyer email', () => {
    expect(transformCharge(makeRaw()).receiptEmail).toBe('jane@example.com')
  })

  it('receiptEmail is undefined when buyer is absent', () => {
    expect(transformCharge(makeRaw({ buyer: undefined })).receiptEmail).toBeUndefined()
  })

  it('maps createdAt from created_at', () => {
    expect(transformCharge(makeRaw()).createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  describe('status mapping', () => {
    it('CLOSED → succeeded', () => {
      expect(transformCharge(makeRaw({ status: 'CLOSED' })).status).toBe('succeeded')
    })

    it('REJECTED → failed', () => {
      expect(transformCharge(makeRaw({ status: 'REJECTED' })).status).toBe('failed')
    })

    it('EXPIRED → failed', () => {
      expect(transformCharge(makeRaw({ status: 'EXPIRED' })).status).toBe('failed')
    })

    it('CANCELLED → cancelled', () => {
      expect(transformCharge(makeRaw({ status: 'CANCELLED' })).status).toBe('cancelled')
    })

    it('CREATED → pending', () => {
      expect(transformCharge(makeRaw({ status: 'CREATED' })).status).toBe('pending')
    })

    it('AUTHORIZED with no captures → pending', () => {
      expect(transformCharge(makeRaw({ status: 'AUTHORIZED', captures: [] })).status).toBe(
        'pending',
      )
    })

    it('AUTHORIZED with captures → succeeded', () => {
      const captures: RawTabbyCapture[] = [{ id: 'cap-1', amount: '330.00' }]
      expect(transformCharge(makeRaw({ status: 'AUTHORIZED', captures })).status).toBe('succeeded')
    })

    it('partial refund → partially_refunded', () => {
      const refunds: RawTabbyRefundEntry[] = [{ id: 'ref-1', amount: '100.00' }]
      expect(
        transformCharge(makeRaw({ status: 'CLOSED', amount: '330.00', currency: 'AED', refunds }))
          .status,
      ).toBe('partially_refunded')
    })

    it('full refund → refunded', () => {
      const refunds: RawTabbyRefundEntry[] = [{ id: 'ref-1', amount: '330.00' }]
      expect(
        transformCharge(makeRaw({ status: 'CLOSED', amount: '330.00', currency: 'AED', refunds }))
          .status,
      ).toBe('refunded')
    })
  })

  it('passes schema validation', () => {
    const result = ChargeSchema.safeParse(transformCharge(makeRaw()))
    expect(result.success).toBe(true)
  })
})
