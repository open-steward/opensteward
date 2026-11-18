import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawKlarnaOrder,
} from '../../../../../../../src/verticals/payments/adapters/klarna/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('klarna transformCharge', () => {
  it('maps a CAPTURED order to succeeded status with correct fields', () => {
    const raw: RawKlarnaOrder = {
      order_id: 'klarna-order-001',
      status: 'CAPTURED',
      order_amount: 4999,
      captured_amount: 4999,
      refunded_amount: 0,
      purchase_currency: 'sek',
      billing_address: {
        email: 'test@example.com',
        given_name: 'Anna',
        family_name: 'Svensson',
      },
      merchant_reference1: 'ref-001',
      klarna_reference: 'KLA-001',
      initial_payment_method: { type: 'invoice' },
      start_date: '2024-01-15T10:00:00Z',
      last_modified_at: '2024-01-15T11:00:00Z',
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('klarna-order-001')
    expect(result.externalId).toBe('klarna-order-001')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('SEK')
    expect(result.status).toBe('succeeded')
    expect(result.receiptEmail).toBe('test@example.com')
    expect(result.description).toBe('Anna Svensson')
    expect(result.gateway).toBe('klarna')
    expect(result.amountCaptured).toBe(4999)
    expect(result.amountRefunded).toBe(0)
    expect(result.metadata.merchant_reference1).toBe('ref-001')
    expect(result.metadata.klarna_reference).toBe('KLA-001')
    expect(result.metadata.initial_payment_method).toBe('invoice')
    expect(result.createdAt).toBe('2024-01-15T10:00:00Z')
    expect(result.updatedAt).toBe('2024-01-15T11:00:00Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an AUTHORIZED order to pending status', () => {
    const raw: RawKlarnaOrder = {
      order_id: 'klarna-order-002',
      status: 'AUTHORIZED',
      order_amount: 1500,
      purchase_currency: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED order to cancelled status', () => {
    const raw: RawKlarnaOrder = {
      order_id: 'klarna-order-003',
      status: 'CANCELLED',
      order_amount: 2000,
      purchase_currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CLOSED order with refund to refunded status', () => {
    const raw: RawKlarnaOrder = {
      order_id: 'klarna-order-004',
      status: 'CLOSED',
      order_amount: 3000,
      refunded_amount: 3000,
      purchase_currency: 'NOK',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.amountRefunded).toBe(3000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when purchase_currency is missing', () => {
    const raw: RawKlarnaOrder = {
      order_id: 'klarna-order-005',
      order_amount: 100,
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('throws when order_amount is missing (requireAmount guard)', () => {
    const raw: RawKlarnaOrder = {
      order_id: 'klarna-order-bad',
    }
    expect(() => transformCharge(raw)).toThrow('klarna charge')
  })
})
