import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawCybersourcePayment,
} from '../../../../../../../src/verticals/payments/adapters/cybersource/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('cybersource transformCharge', () => {
  it('maps a SETTLED payment to succeeded with upper-cased currency', () => {
    const raw: RawCybersourcePayment = {
      id: 'cs_1',
      status: 'SETTLED',
      submitTimeUtc: '2023-11-14T10:00:00Z',
      reconciliationId: 'rec_abc',
      clientReferenceInformation: { code: 'order-42' },
      orderInformation: {
        amountDetails: { totalAmount: '25.00', currency: 'usd' },
        billTo: { firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' },
      },
    }
    const result = transformCharge(raw)

    expect(result.id).toBe('cs_1')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.receiptEmail).toBe('jane@test.com')
    expect(result.gateway).toBe('cybersource')
    expect(result.metadata.reconciliationId).toBe('rec_abc')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a DECLINED payment to failed with error fields', () => {
    const raw: RawCybersourcePayment = {
      id: 'cs_2',
      status: 'DECLINED',
      submitTimeUtc: '2023-11-14T10:00:00Z',
      orderInformation: {
        amountDetails: { totalAmount: '10.00', currency: 'EUR' },
      },
      errorInformation: { reason: 'CV_FAILED', message: 'Card verification failed' },
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('CV_FAILED')
    expect(result.failureMessage).toBe('Card verification failed')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps VOIDED status to cancelled', () => {
    const raw: RawCybersourcePayment = {
      id: 'cs_3',
      status: 'VOIDED',
      orderInformation: {
        amountDetails: { totalAmount: '5.00', currency: 'GBP' },
      },
    }
    const result = transformCharge(raw)

    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('builds description from billTo name when code absent', () => {
    const raw: RawCybersourcePayment = {
      id: 'cs_4',
      status: 'TRANSMITTED',
      orderInformation: {
        amountDetails: { totalAmount: '99.99', currency: 'USD' },
        billTo: { firstName: 'John', lastName: 'Smith' },
      },
    }
    const result = transformCharge(raw)

    expect(result.description).toBe('John Smith')
    expect(result.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
