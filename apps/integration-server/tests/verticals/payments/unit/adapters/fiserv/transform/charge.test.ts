import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawFiservTransaction,
} from '../../../../../../../src/verticals/payments/adapters/fiserv/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('fiserv transformCharge', () => {
  it('maps a CAPTURED transaction to status "succeeded" with minor units', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionType: 'CHARGE',
        transactionState: 'CAPTURED',
        transactionProcessingDetails: {
          transactionId: 'TXN-001',
          orderId: 'ORD-001',
          transactionTimestamp: '2024-03-01T00:00:00Z',
          apiTraceId: 'TRACE-001',
        },
      },
      transactionDetails: {
        captureFlag: true,
        merchantTransactionId: 'MTXN-001',
      },
      amount: { total: 49.99, currency: 'USD' },
      paymentReceipt: {
        approvedAmount: { total: 49.99, currency: 'USD' },
        processorResponseDetails: {
          approvalStatus: 'APPROVED',
          approvalCode: 'OK123',
        },
      },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('TXN-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.captured).toBe(true)
    expect(result.amountCaptured).toBe(4999)
    expect(result.gateway).toBe('fiserv')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a SETTLED transaction to status "succeeded"', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'SETTLED',
        transactionProcessingDetails: { transactionId: 'TXN-002' },
      },
      amount: { total: 10.0, currency: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an AUTHORIZED transaction to status "pending"', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'AUTHORIZED',
        transactionProcessingDetails: { transactionId: 'TXN-003' },
      },
      transactionDetails: { captureFlag: false },
      amount: { total: 20.0, currency: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a DECLINED transaction to status "failed" with error info', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'DECLINED',
        transactionProcessingDetails: { transactionId: 'TXN-004' },
      },
      amount: { total: 30.0, currency: 'USD' },
      paymentReceipt: {
        processorResponseDetails: {
          approvalStatus: 'DECLINED',
          responseCode: 'D123',
          responseMessage: 'Card declined',
        },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('D123')
    expect(result.failureMessage).toBe('Card declined')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a VOIDED transaction to status "cancelled"', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'VOIDED',
        transactionProcessingDetails: { transactionId: 'TXN-005' },
      },
      amount: { total: 15.0, currency: 'EUR' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to processor approvalStatus APPROVED when state is unknown', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionState: 'UNKNOWN_STATE',
        transactionProcessingDetails: { transactionId: 'TXN-006' },
      },
      amount: { total: 25.0, currency: 'USD' },
      paymentReceipt: {
        processorResponseDetails: { approvalStatus: 'APPROVED' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('stores metadata fields from gateway and processor response', () => {
    const raw: RawFiservTransaction = {
      gatewayResponse: {
        transactionType: 'CHARGE',
        transactionState: 'CAPTURED',
        transactionProcessingDetails: {
          transactionId: 'TXN-007',
          orderId: 'ORD-007',
          apiTraceId: 'TRACE-007',
        },
      },
      amount: { total: 5.0, currency: 'USD' },
      source: { sourceType: 'PaymentCard', card: { last4: '1234', scheme: 'VISA' } },
    }
    const result = transformCharge(raw)
    expect(result.metadata['transactionType']).toBe('CHARGE')
    expect(result.metadata['cardLast4']).toBe('1234')
    expect(result.metadata['cardScheme']).toBe('VISA')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
