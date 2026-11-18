import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  transformChargeListItem,
  type RawPaytmOrderListRow,
  type RawPaytmTxn,
} from '../../../../../../../src/verticals/payments/adapters/paytm/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('paytm transformCharge', () => {
  it('maps a TXN_SUCCESS transaction to status "succeeded" with minor-unit amount', () => {
    const raw: RawPaytmTxn = {
      resultInfo: {
        resultStatus: 'TXN_SUCCESS',
        resultCode: '01',
        resultMsg: 'Txn Successful',
      },
      txnId: 'PAYTM_TXN_001',
      bankTxnId: 'BANK_TXN_001',
      orderId: 'ORDER_001',
      txnAmount: '500.00',
      txnType: 'SALE',
      gatewayName: 'HDFC',
      bankName: 'HDFC',
      mid: 'MID123456',
      paymentMode: 'CC',
      txnDate: '2024-03-01 12:00:00',
      currency: 'INR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('INR')
    expect(result.captured).toBe(true)
    expect(result.gateway).toBe('paytm')
    expect(result.id).toBe('ORDER_001')
    expect(result.externalId).toBe('ORDER_001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a TXN_FAILURE to status "failed" with failure fields', () => {
    const raw: RawPaytmTxn = {
      resultInfo: {
        resultStatus: 'TXN_FAILURE',
        resultCode: '330',
        resultMsg: 'Transaction Failed',
      },
      txnId: 'PAYTM_TXN_002',
      orderId: 'ORDER_002',
      txnAmount: '200.00',
      txnDate: '2024-03-01 14:00:00',
      currency: 'INR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Transaction Failed')
    expect(result.failureCode).toBe('330')
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING transaction to status "pending"', () => {
    const raw: RawPaytmTxn = {
      resultInfo: {
        resultStatus: 'PENDING',
        resultCode: '227',
        resultMsg: 'Transaction is pending',
      },
      txnId: 'PAYTM_TXN_003',
      orderId: 'ORDER_003',
      txnAmount: '150.00',
      txnDate: '2024-03-01 15:00:00',
      currency: 'INR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(15000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('includes amountRefunded when refundAmt is positive', () => {
    const raw: RawPaytmTxn = {
      resultInfo: { resultStatus: 'TXN_SUCCESS' },
      orderId: 'ORDER_004',
      txnAmount: '100.00',
      refundAmt: '50.00',
      txnDate: '2024-03-01 10:00:00',
      currency: 'INR',
    }
    const result = transformCharge(raw)
    expect(result.amountRefunded).toBe(5000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

describe('paytm transformChargeListItem (Order List API row)', () => {
  it('maps a SUCCESS row to status "succeeded" with minor-unit amount, keyed by merchantOrderId', () => {
    const raw: RawPaytmOrderListRow = {
      merchantOrderId: 'PPBL477643',
      txnId: '20210201111212800110168833802307085',
      orderCreatedTime: '2021-02-01 12:30:20',
      orderCompletedTime: '2021-02-01 12:30:21',
      orderSearchType: 'TRANSACTION',
      orderSearchStatus: 'SUCCESS',
      mid: 'INTEGR77698636129383',
      merchantName: 'TEST INTEGRATION 5',
      payMode: 'BANK_TRANSFER',
      amount: '100.00',
      vanId: 'vanId-PYI3831611899004',
      rrn: 'rrnCode-769177004644',
      vanIfscCode: 'PYTM0123456',
    }
    const result = transformChargeListItem(raw)
    expect(result.id).toBe('PPBL477643')
    expect(result.externalId).toBe('PPBL477643')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.gateway).toBe('paytm')
    expect(result.metadata.rrn).toBe('rrnCode-769177004644')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps FAILURE/PENDING rows without setting captured', () => {
    const failure = transformChargeListItem({ merchantOrderId: 'O2', orderSearchStatus: 'FAILURE', amount: '10.00' })
    expect(failure.status).toBe('failed')
    expect(failure.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(failure)).not.toThrow()

    const pending = transformChargeListItem({ merchantOrderId: 'O3', orderSearchStatus: 'PENDING', amount: '10.00' })
    expect(pending.status).toBe('pending')
    expect(pending.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(pending)).not.toThrow()
  })

  it('maps an unrecognised orderSearchStatus to "unknown" rather than guessing', () => {
    const result = transformChargeListItem({ merchantOrderId: 'O4', orderSearchStatus: 'SOMETHING_NEW', amount: '10.00' })
    expect(result.status).toBe('unknown')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back id to txnId when merchantOrderId is absent', () => {
    const result = transformChargeListItem({ txnId: 'TXN9', orderSearchStatus: 'SUCCESS', amount: '5.00' })
    expect(result.id).toBe('TXN9')
    expect(result.externalId).toBe('TXN9')
  })
})
