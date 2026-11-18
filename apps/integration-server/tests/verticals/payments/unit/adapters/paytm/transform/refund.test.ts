import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  transformRefundListItem,
  type RawPaytmRefund,
  type RawPaytmRefundListRow,
} from '../../../../../../../src/verticals/payments/adapters/paytm/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paytm transformRefund', () => {
  it('maps a TXN_SUCCESS refund to status "succeeded" with minor-unit amount', () => {
    const raw: RawPaytmRefund = {
      resultInfo: {
        resultStatus: 'TXN_SUCCESS',
        resultCode: '10',
        resultMsg: 'Refund Successful',
      },
      refundId: 'REFUND_001',
      txnId: 'PAYTM_TXN_001',
      orderId: 'ORDER_001',
      refId: 'MERCHANT_REF_001',
      mid: 'MID123456',
      refundAmount: '150.00',
      txnAmount: '500.00',
      refundType: 'FULL',
      currency: 'INR',
      acceptRefundTimestamp: '2024-03-01 12:00:00',
      txnTimestamp: '2024-03-01 10:00:00',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(15000)
    expect(result.currency).toBe('INR')
    expect(result.chargeId).toBe('ORDER_001')
    expect(result.gateway).toBe('paytm')
    expect(result.id).toBe('REFUND_001')
    expect(result.externalId).toBe('REFUND_001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING refund to status "pending"', () => {
    const raw: RawPaytmRefund = {
      resultInfo: {
        resultStatus: 'PENDING',
        resultCode: '501',
        resultMsg: 'Refund is pending',
      },
      refundId: 'REFUND_002',
      orderId: 'ORDER_002',
      refundAmount: '75.00',
      currency: 'INR',
      txnTimestamp: '2024-03-01 11:00:00',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(7500)
    expect(result.chargeId).toBe('ORDER_002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a TXN_FAILURE refund to status "failed" with failureReason', () => {
    const raw: RawPaytmRefund = {
      resultInfo: {
        resultStatus: 'TXN_FAILURE',
        resultCode: '400',
        resultMsg: 'Refund Failed',
      },
      refundId: 'REFUND_003',
      orderId: 'ORDER_003',
      refundAmount: '50.00',
      currency: 'INR',
      txnTimestamp: '2024-03-01 13:00:00',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund Failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back id to refId and chargeId to txnId when orderId/refundId absent', () => {
    const raw: RawPaytmRefund = {
      resultInfo: { resultStatus: 'TXN_SUCCESS' },
      refId: 'MERCHANT_REF_999',
      txnId: 'PAYTM_TXN_999',
      refundAmount: '25.00',
      currency: 'INR',
      txnTimestamp: '2024-03-01 09:00:00',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('MERCHANT_REF_999')
    expect(result.chargeId).toBe('PAYTM_TXN_999')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('paytm transformRefundListItem (Refund List API row)', () => {
  it('maps a SUCCESS row to status "succeeded", with id = "<orderId>:<refId>" (not the raw refundId)', () => {
    const raw: RawPaytmRefundListRow = {
      orderId: 'PARCEL213321',
      merchantRefundRequestTimeStamp: '2020-06-02 14:40:06',
      acceptRefundTimeStamp: '2020-06-02 14:40:07',
      txnTimeStamp: '2020-06-02 13:40:05',
      acceptRefundStatus: 'SUCCESS',
      mid: 'INTEGR7769XXXXXX9383',
      txnAmount: '1.00',
      refundId: '200602870171336224',
      refundAmount: '1.00',
      refId: 'REF_PARCEL213321',
    }
    const result = transformRefundListItem(raw)
    // id round-trips into getRefund(id), which requires "<orderId>:<refId>".
    expect(result.id).toBe('PARCEL213321:REF_PARCEL213321')
    expect(result.externalId).toBe('PARCEL213321:REF_PARCEL213321')
    expect(result.chargeId).toBe('PARCEL213321')
    expect(result.amount).toBe(100)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('paytm')
    // The true Paytm-issued refundId still rides along in metadata.
    expect(result.metadata.refundId).toBe('200602870171336224')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps FAILURE/PENDING acceptRefundStatus and an unrecognised value to "unknown"', () => {
    const failed = transformRefundListItem({ orderId: 'O1', refId: 'R1', acceptRefundStatus: 'FAILURE', refundAmount: '1.00' })
    expect(failed.status).toBe('failed')
    expect(() => RefundSchema.parse(failed)).not.toThrow()

    const pending = transformRefundListItem({ orderId: 'O1', refId: 'R1', acceptRefundStatus: 'PENDING', refundAmount: '1.00' })
    expect(pending.status).toBe('pending')
    expect(() => RefundSchema.parse(pending)).not.toThrow()

    const unknown = transformRefundListItem({ orderId: 'O1', refId: 'R1', acceptRefundStatus: 'WEIRD', refundAmount: '1.00' })
    expect(unknown.status).toBe('unknown')
    expect(() => RefundSchema.parse(unknown)).not.toThrow()
  })

  it('falls back the created timestamp to txnTimeStamp when acceptRefundTimeStamp is absent', () => {
    const result = transformRefundListItem({
      orderId: 'O1',
      refId: 'R1',
      acceptRefundStatus: 'SUCCESS',
      refundAmount: '1.00',
      txnTimeStamp: '2020-06-02 13:40:05',
    })
    expect(result.createdAt).toBe('2020-06-02T08:10:05.000Z')
  })
})
