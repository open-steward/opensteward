import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawTamaraOrder,
} from '../../../../../../../src/verticals/payments/adapters/tamara/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('tamara transformCharge', () => {
  it('maps a fully_captured order to status "succeeded" with correct amount in minor units', () => {
    const raw: RawTamaraOrder = {
      order_id: 'ord-001',
      status: 'fully_captured',
      total_amount: { amount: '100.00', currency: 'SAR' },
      captured_amount: { amount: '100.00', currency: 'SAR' },
      consumer: {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
      },
      description: 'Test order',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('SAR')
    expect(result.gateway).toBe('tamara')
    expect(result.receiptEmail).toBe('jane@example.com')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined order to status "failed"', () => {
    const raw: RawTamaraOrder = {
      order_id: 'ord-002',
      status: 'declined',
      total_amount: { amount: '50.00', currency: 'AED' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('AED')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a canceled order to status "cancelled"', () => {
    const raw: RawTamaraOrder = {
      order_id: 'ord-003',
      status: 'canceled',
      total_amount: { amount: '75.00', currency: 'SAR' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.id).toBe('ord-003')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a partially_refunded order correctly', () => {
    const raw: RawTamaraOrder = {
      order_id: 'ord-004',
      status: 'partially_refunded',
      total_amount: { amount: '200.00', currency: 'SAR' },
      refunded_amount: { amount: '50.00', currency: 'SAR' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(5000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses KWD with 3-decimal minor units correctly', () => {
    const raw: RawTamaraOrder = {
      order_id: 'ord-005',
      status: 'fully_captured',
      total_amount: { amount: '10.000', currency: 'KWD' },
    }
    const result = transformCharge(raw)
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('KWD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
