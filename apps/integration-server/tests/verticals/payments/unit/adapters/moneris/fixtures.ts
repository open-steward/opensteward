/**
 * Fixtures from the documented examples of the Moneris API 2.15.1 OpenAPI
 * definition. Payments are `listPaymentsResponse.example.data`
 * (https://developer.moneris.com/moneris-api/reference/getpayments.md),
 * refunds are `listRefundsSuccessResponse.example.data`
 * (https://developer.moneris.com/moneris-api/reference/getrefunds.md), the
 * subscription is `retrieveSubscriptionSuccessResponse.example`
 * (https://developer.moneris.com/moneris-api/reference/getsubscription.md),
 * and the customer is built from the `customer` schema's property examples
 * (https://developer.moneris.com/moneris-api/reference/getcustomers.md),
 * which carries no whole-object example. Nested objects the transforms do
 * not read are trimmed.
 */
import type { RawMonerisCustomer } from '../../../../../../src/verticals/payments/adapters/moneris/transform/customer'
import type { RawMonerisPayment } from '../../../../../../src/verticals/payments/adapters/moneris/transform/charge'
import type { RawMonerisRefund } from '../../../../../../src/verticals/payments/adapters/moneris/transform/refund'
import type { RawMonerisSubscription } from '../../../../../../src/verticals/payments/adapters/moneris/transform/subscription'

export const CUSTOMER: RawMonerisCustomer = {
  customerId: 'ci0105ARZ3NDEKTSV4RRFFQ69G5FAV',
  merchantId: '0123456789101',
  createdAt: '2019-07-30T06:43:40.252Z',
  modifiedAt: '2019-07-30T06:43:40.252Z',
  firstName: 'John',
  middleName: 'J.',
  lastName: 'Doe',
  companyName: 'SP Ltd',
  phoneNumber: '+18663197450',
  email: 'moneris@moneris.com',
}

const PAYMENT_METHOD = {
  paymentMethodId: 'pm0105ARZ3NDEKTSV4RRFFQ69G5FAV',
  merchantId: '0123456789101',
  cardholderInformation: null,
  contactDetails: null,
  billingAddress: null,
  createdAt: '2019-07-30T06:43:40.252Z',
  modifiedAt: null,
  customData: { property1: 'string', property2: 'string' },
}

function payment(
  paymentId: string,
  paymentStatus: RawMonerisPayment['paymentStatus'],
  authorized: number,
): RawMonerisPayment {
  return {
    paymentId,
    merchantId: '0123456789101',
    orderId: '1q2w3e4r5t6t78',
    invoiceNumber: '1a2s3d45v6',
    transactionDateTime: '2019-07-30T06:43:40.252Z',
    createdAt: '2019-07-30T06:43:40.252Z',
    modifiedAt: '2019-07-30T06:43:40.252Z',
    amount: { amount: 16000, currency: 'CAD' },
    authorizedAmount: { amount: authorized, currency: 'CAD' },
    capturableAmount: { amount: 0, currency: 'CAD' },
    amountDetails: null,
    customerId: 'ci0105ARZ3NDEKTSV4RRFFQ69G5FAV',
    paymentMethod: PAYMENT_METHOD,
    paymentStatus,
    credentialOnFileResponse: null,
    refundDetails: null,
    customData: { property1: 'string', property2: 'string' },
  }
}

export const PAYMENT_SUCCEEDED = payment('pi0105ARZ3NDEKTSV4RRFFQ69G5FAV', 'SUCCEEDED', 16000)
export const PAYMENT_CANCELED = payment('pi0105ARZ3NDEKTSV4RRFFQ69G5FAZ', 'CANCELED', 16000)
export const PAYMENT_DECLINED = payment('pi0105ARZ3NDEKTSV4RRFFQ69G5FAX', 'DECLINED', 0)

function refund(refundStatus: RawMonerisRefund['refundStatus']): RawMonerisRefund {
  return {
    refundId: 'ri0105ARZ3NDEKTSV4RRFFQ69G5FAV',
    payment: { paymentId: 'pi0105ARZ3NDEKTSV4RRFFQ69G5FAV' },
    merchantId: '0123456789101',
    paymentMethod: PAYMENT_METHOD,
    createdAt: '2019-07-30T06:43:40.252Z',
    modifiedAt: '2019-07-30T06:43:40.252Z',
    refundAmount: { amount: 1600, currency: 'CAD' },
    customerId: 'ci0105ARZ3NDEKTSV4RRFFQ69G5FAV',
    refundStatus,
    reason: 'Defective product',
    credentialOnFileResponse: null,
    customData: { property1: 'string', property2: 'string' },
  }
}

export const REFUND_SUCCEEDED = refund('SUCCEEDED')
export const REFUND_DECLINED = refund('DECLINED')

export const SUBSCRIPTION: RawMonerisSubscription = {
  subscriptionId: 'rp0105ARZ3NDEKTSV4RRFFQ69G5FAV',
  merchantId: '0123456789101',
  orderId: '1q2w3e4r5t6t78',
  invoiceNumber: '1a2s3d45v6',
  customerId: 'ci0105ARZ3NDEKTSV4RRFFQ69G5FAV',
  createdAt: '2023-02-25T06:43:40.252Z',
  modifiedAt: '2023-02-26T06:43:40.252Z',
  subscriptionType: 'RECURRING',
  billingInformation: {
    billingIntervalUnit: 'WEEK',
    billingIntervalFrequency: 2,
    billingIntervalCount: 2,
    billingAmount: { amount: 2500, currency: 'CAD' },
    billingStartDate: '2025-02-01',
    nextBillingDate: '2025-02-14',
    billingEndDate: '2025-02-28',
  },
  callbackUrl: 'https://myserver.com/send/callback/here',
  paymentMethod: { ...PAYMENT_METHOD, paymentMethodId: 'pi0105ARZ3NDEKTSV4RRFFQ69G5FAV' },
  subscriptionStatus: 'ACTIVE',
  oneTimeAmount: { amount: 16000, currency: 'CAD' },
  payments: [
    {
      paymentId: 'pi0105ARZ3NDEKTSV4RRFFQ69G5FAV',
      href: '/payments/pi0105ARZ3NDEKTSV4RRFFQ69G5FAV',
    },
  ],
}
