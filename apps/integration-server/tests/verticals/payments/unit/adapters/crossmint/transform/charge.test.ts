import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawCrossmintOrder,
} from '../../../../../../../src/verticals/payments/adapters/crossmint/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('crossmint transformCharge', () => {
  it('maps a completed order to status "succeeded" with correct amount and currency', () => {
    const raw: RawCrossmintOrder = {
      orderId: 'order-001',
      phase: 'completed',
      quote: {
        status: 'valid',
        totalPrice: { amount: '49.99', currency: 'usd' },
      },
      payment: {
        status: 'completed',
        method: 'fiat',
        currency: 'usd',
        receiptEmail: 'buyer@example.com',
      },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('order-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('crossmint')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an awaiting-payment order to status "pending"', () => {
    const raw: RawCrossmintOrder = {
      orderId: 'order-002',
      quote: {
        totalPrice: { amount: '10.00', currency: 'usdc' },
      },
      payment: {
        status: 'awaiting-payment',
        currency: 'usdc',
      },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(1000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a failed order to status "failed" and includes failureMessage', () => {
    const raw: RawCrossmintOrder = {
      orderId: 'order-003',
      quote: {
        totalPrice: { amount: '25.00', currency: 'usd' },
      },
      payment: {
        status: 'failed',
        currency: 'usd',
        failureReason: 'Card declined',
      },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses line item delivery recipient email when present', () => {
    const raw: RawCrossmintOrder = {
      orderId: 'order-004',
      quote: {
        totalPrice: { amount: '5.00', currency: 'usd' },
      },
      payment: {
        status: 'completed',
        currency: 'usd',
      },
      lineItems: [
        {
          metadata: { name: 'Cool NFT' },
          delivery: {
            status: 'completed',
            recipient: { email: 'nft-buyer@example.com' },
          },
        },
      ],
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.receiptEmail).toBe('nft-buyer@example.com')
    expect(result.description).toBe('Cool NFT')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
