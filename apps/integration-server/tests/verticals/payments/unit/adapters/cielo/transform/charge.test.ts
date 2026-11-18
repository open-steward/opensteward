import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawCieloSale,
} from '../../../../../../../src/verticals/payments/adapters/cielo/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const baseSale: RawCieloSale = {
  MerchantOrderId: 'ORD-001',
  Customer: {
    Name: 'Alice Smith',
    Email: 'alice@example.com',
    Identity: '12345678900',
    IdentityType: 'CPF',
  },
  Payment: {
    PaymentId: 'PAY-UUID-001',
    Type: 'CreditCard',
    Amount: 9900,
    CapturedAmount: 9900,
    Currency: 'BRL',
    Provider: 'Simulado',
    Status: 2, // PaymentConfirmed (captured) → succeeded
    ReceivedDate: '2024-03-01T00:00:00',
    CapturedDate: '2024-03-01T00:00:00',
    AuthorizationCode: 'AUTH-001',
    Tid: 'TID-001',
    ProofOfSale: 'POS-001',
    ReturnCode: '4',
    ReturnMessage: 'Operation Successful',
    CreditCard: {
      Brand: 'Visa',
      Holder: 'ALICE SMITH',
    },
  },
}

describe('cielo transformCharge', () => {
  it('maps Status 2 (PaymentConfirmed) to "succeeded"', () => {
    const result = transformCharge(baseSale)
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('cielo')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('surfaces amount (centavos) and currency', () => {
    const result = transformCharge(baseSale)
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('BRL')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps Status 3 (Denied) to "failed"', () => {
    const result = transformCharge({
      ...baseSale,
      Payment: { ...baseSale.Payment, Status: 3 },
    })
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps Status 10 (Voided) to "cancelled"', () => {
    const result = transformCharge({
      ...baseSale,
      Payment: { ...baseSale.Payment, Status: 10, CapturedAmount: 0 },
    })
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps Status 11 (Refunded) to "refunded"', () => {
    const result = transformCharge({
      ...baseSale,
      Payment: { ...baseSale.Payment, Status: 11, CapturedAmount: 9900 },
    })
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps Status 1 (Authorized) to "pending"', () => {
    const result = transformCharge({
      ...baseSale,
      Payment: { ...baseSale.Payment, Status: 1, CapturedAmount: 0 },
    })
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('surfaces receiptEmail from Customer.Email', () => {
    const result = transformCharge(baseSale)
    expect(result.receiptEmail).toBe('alice@example.com')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('surfaces PaymentId as id and externalId', () => {
    const result = transformCharge(baseSale)
    expect(result.id).toBe('PAY-UUID-001')
    expect(result.externalId).toBe('PAY-UUID-001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('normalises a naive ISO timestamp (no zone) to UTC', () => {
    const result = transformCharge(baseSale)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
