import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawCcavenueOrderStatus,
} from '../../../../../../../src/verticals/payments/adapters/ccavenue/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('ccavenue transformCharge', () => {
  it('maps a Successful order to status "succeeded"', () => {
    const raw: RawCcavenueOrderStatus = {
      reference_no: 'REF-001',
      order_no: 'ORD-001',
      order_currncy: 'INR',
      order_amt: '1499.5',
      order_capt_amt: '1499.5',
      order_status: 'Successful',
      order_bill_email: 'buyer@example.com',
      order_date_time: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('REF-001')
    expect(result.amount).toBe(149950)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.amountCaptured).toBe(149950)
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('ccavenue')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an Aborted order to status "cancelled"', () => {
    const raw: RawCcavenueOrderStatus = {
      reference_no: 'REF-002',
      order_currncy: 'USD',
      order_amt: '10.00',
      order_capt_amt: '0',
      order_status: 'Aborted',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an Unsuccessful order to status "failed"', () => {
    const raw: RawCcavenueOrderStatus = {
      reference_no: 'REF-003',
      order_currncy: 'INR',
      order_amt: '500.0',
      order_capt_amt: '0',
      order_status: 'Unsuccessful',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a Refunded order to status "refunded"', () => {
    const raw: RawCcavenueOrderStatus = {
      reference_no: 'REF-004',
      order_currncy: 'INR',
      order_amt: '200.0',
      order_capt_amt: '0',
      order_status: 'Refunded',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses order_no as id when reference_no is absent', () => {
    const raw: RawCcavenueOrderStatus = {
      order_no: 'ORD-FALLBACK',
      order_currncy: 'INR',
      order_amt: '100.0',
      order_capt_amt: '0',
      order_status: 'Initiated',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('ORD-FALLBACK')
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
