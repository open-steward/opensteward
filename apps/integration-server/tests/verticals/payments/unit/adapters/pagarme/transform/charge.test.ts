import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  transformOrderCharges,
  type RawPagarmeCharge,
  type RawPagarmeOrder,
} from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('pagarme transformCharge', () => {
  it('maps core fields to canonical charge', () => {
    const raw: RawPagarmeCharge = {
      id: 'ch_abc123',
      code: 'ORD-001',
      amount: 10000,
      paid_amount: 10000,
      currency: 'brl',
      status: 'paid',
      customer: { id: 'cus_xyz', email: 'user@example.com' },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T01:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('ch_abc123')
    expect(result.externalId).toBe('ORD-001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('BRL')
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('cus_xyz')
    expect(result.receiptEmail).toBe('user@example.com')
    expect(result.amountCaptured).toBe(10000)
    expect(result.gateway).toBe('pagarme')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps failed charge with last_transaction error info', () => {
    const raw: RawPagarmeCharge = {
      id: 'ch_fail',
      amount: 5000,
      currency: 'brl',
      status: 'failed',
      last_transaction: {
        id: 'tx_001',
        success: false,
        acquirer_message: 'Insufficient funds',
        acquirer_return_code: '51',
      },
      created_at: '2024-03-02T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.captured).toBeUndefined()
    expect(result.paymentMethodId).toBe('tx_001')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(result.failureCode).toBe('51')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps chargedback status to disputed', () => {
    const raw: RawPagarmeCharge = {
      id: 'ch_disp',
      amount: 2000,
      currency: 'brl',
      status: 'chargedback',
      created_at: '2024-03-03T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('disputed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps partial_canceled status to partially_refunded', () => {
    const raw: RawPagarmeCharge = {
      id: 'ch_partial',
      amount: 8000,
      currency: 'brl',
      status: 'partial_canceled',
      created_at: '2024-03-04T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps canceled status to cancelled', () => {
    const raw: RawPagarmeCharge = {
      id: 'ch_can',
      amount: 3000,
      currency: 'brl',
      status: 'canceled',
      canceled_at: '2024-03-05T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('links invoice and order metadata', () => {
    const raw: RawPagarmeCharge = {
      id: 'ch_linked',
      amount: 1000,
      currency: 'brl',
      status: 'paid',
      invoice: { id: 'inv_99' },
      order: { id: 'ord_77' },
      gateway_id: 'gw_42',
      payment_method: 'credit_card',
      created_at: '2024-03-06T00:00:00Z',
      paid_at: '2024-03-06T01:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.invoiceId).toBe('inv_99')
    expect(result.metadata['order_id']).toBe('ord_77')
    expect(result.metadata['gateway_id']).toBe('gw_42')
    expect(result.metadata['payment_method']).toBe('credit_card')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to BRL when currency is absent', () => {
    const raw: RawPagarmeCharge = {
      id: 'ch_nocurr',
      amount: 500,
      status: 'pending',
      created_at: '2024-03-07T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('BRL')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

describe('pagarme transformOrderCharges', () => {
  it('maps each order charge to canonical Charge', () => {
    const order: RawPagarmeOrder = {
      id: 'ord_1',
      currency: 'brl',
      customer: { id: 'cus_order', email: 'order@example.com' },
      charges: [
        { id: 'ch_o1', amount: 2500, status: 'paid', created_at: '2024-03-01T00:00:00Z' },
        { id: 'ch_o2', amount: 1500, status: 'failed', created_at: '2024-03-02T00:00:00Z' },
      ],
    }
    const results = transformOrderCharges(order)
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe('ch_o1')
    expect(results[0].currency).toBe('BRL')
    expect(results[0].customerId).toBe('cus_order')
    expect(results[0].metadata['order_id']).toBe('ord_1')
    expect(results[1].id).toBe('ch_o2')
    expect(results[1].status).toBe('failed')
    results.forEach((r) => expect(() => ChargeSchema.parse(r)).not.toThrow())
  })

  it('returns empty array when order has no charges', () => {
    const order: RawPagarmeOrder = { id: 'ord_empty' }
    expect(transformOrderCharges(order)).toEqual([])
  })
})
