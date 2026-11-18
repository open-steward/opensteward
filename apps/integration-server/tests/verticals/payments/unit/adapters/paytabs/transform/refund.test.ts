import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPaytabsRefund,
} from '../../../../../../../src/verticals/payments/adapters/paytabs/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paytabs transformRefund', () => {
  it('maps an authorised refund to status "succeeded" with correct minor-unit amount', () => {
    const raw: RawPaytabsRefund = {
      tran_ref: 'TST2024REF001',
      tran_type: 'refund',
      cart_id: 'cart-001',
      cart_currency: 'AED',
      cart_amount: '100.00',
      payment_result: {
        response_status: 'A',
        response_code: '100',
        response_message: 'Refund Authorised',
        transaction_time: '2024-03-01T00:00:00Z',
      },
    }
    const chargeId = 'TST2024000001'
    const result = transformRefund(raw, chargeId)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('AED')
    expect(result.chargeId).toBe('TST2024000001')
    expect(result.gateway).toBe('paytabs')
    expect(result.id).toBe('TST2024REF001')
    expect(result.externalId).toBe('TST2024REF001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund to status "pending"', () => {
    const raw: RawPaytabsRefund = {
      tran_ref: 'TST2024REF002',
      tran_type: 'refund',
      cart_currency: 'SAR',
      cart_amount: '50.00',
      payment_result: {
        response_status: 'P',
        transaction_time: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformRefund(raw, 'TST2024000002')
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(5000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a declined refund to status "failed" with failureReason', () => {
    const raw: RawPaytabsRefund = {
      tran_ref: 'TST2024REF003',
      tran_type: 'refund',
      cart_currency: 'USD',
      cart_amount: '25.00',
      payment_result: {
        response_status: 'D',
        response_code: '999',
        response_message: 'Refund declined',
        transaction_time: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformRefund(raw, 'TST2024000003')
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund declined')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled refund to status "cancelled"', () => {
    const raw: RawPaytabsRefund = {
      tran_ref: 'TST2024REF004',
      tran_type: 'refund',
      cart_currency: 'AED',
      cart_amount: '10.00',
      payment_result: {
        response_status: 'C',
        transaction_time: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformRefund(raw, 'TST2024000004')
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
