/**
 * Fixtures copied from the documented examples in the Tyro Connect Reporting
 * spec: https://docs.connect.tyro.com/_spec/api-explorer/reporting/1.0/index.yaml
 * ("Multiple Transactions" and "Multiple Settlements Returned").
 */
import type { RawTyroTransaction } from '../../../../../../../src/verticals/payments/adapters/tyro/transform/charge'
import type { RawTyroSettlement } from '../../../../../../../src/verticals/payments/adapters/tyro/transform/payout'

export const DOC_TRANSACTION: RawTyroTransaction = {
  transactionId: '5c05f70e3f0e3bd3b5359d5cf20e5a75fb4dd525229350e15137e78f1bfa4de6',
  transactionLocalDateTime: '2025-05-26T00:22:06',
  transactionStatus: 'APPROVED',
  transactionDescription: null,
  locationId: '122',
  tid: 7,
  deviceType: 'BYO',
  mobilePlatformType: null,
  paymentType: 'GOODS_AND_SERVICES',
  feeType: 'INTERNATIONAL',
  fromAccountType: 'CREDIT',
  isExpressPayment: false,
  card: {
    type: 'MASTERCARD',
    cardLastFour: 'XXXXXXXXXXXX0007',
    cardEntryMode: 'MAG_STRIPE',
    cardPresent: true,
  },
  isEcommerceTransaction: false,
  ecommerceOrderId: null,
  isRefund: false,
  refundReason: null,
  isReversal: false,
  reversalReason: null,
  isInternational: true,
  dcc: {
    currencyCode: null,
    exchangeRate: null,
    foreignCurrencyAmount: null,
    merchantCommissionAmount: 0,
  },
  amountDetails: {
    saleAmount: 9000,
    refundAmount: 0,
    tipAmount: 1000,
    cashOutAmount: 0,
    surchargeAmount: 409,
    donationAmount: 0,
  },
  totalAmount: 10409,
  amountToPayMerchant: 10000,
  settlementAmount: 10000,
  merchantAcquiringFee: 0.2602,
  acquirerActionCode: 'APPROVED',
  rrn: 514600990020,
  tyroReference: 990020,
  integratedTransactionId: '85c9090d-3a80-4c2f-8e3a-f2513f3426f0',
}

/** The documented refund row of the same example. */
export const DOC_REFUND_TRANSACTION: RawTyroTransaction = {
  ...DOC_TRANSACTION,
  transactionId: '45b60cf98f723bd3b5359d5cf20e5a75fb4dd525229350e15137eae654e210b3',
  deviceType: null,
  paymentType: 'REFUND_GOODS_AND_SERVICES',
  card: {
    type: 'VISA',
    cardLastFour: 'XXXXXXXXXXXX0002',
    cardEntryMode: 'MAG_STRIPE',
    cardPresent: true,
  },
  isRefund: true,
  amountDetails: {
    saleAmount: 0,
    refundAmount: -10000,
    tipAmount: 0,
    cashOutAmount: 0,
    surchargeAmount: 0,
    donationAmount: 0,
  },
  totalAmount: -10000,
  amountToPayMerchant: -10000,
  settlementAmount: -10000,
  merchantAcquiringFee: 0,
  rrn: 990021002206,
  tyroReference: 990018,
  integratedTransactionId: '5253aa4e-95dd-466b-9e4e-1fee1b640e77',
}

export const DOC_SETTLEMENT: RawTyroSettlement = {
  clearingPaymentId: 'e6da4a8e-70f3-4156-9b81-f027f061d59e',
  grossAmount: 20011,
  settlementDetails: [
    {
      type: 'EXTERNAL_BANK_ACCOUNT',
      bsb: '840300',
      institutionName: 'MyBank',
      accountNumber: '****9201',
      accountName: 'Potene Enterprises Pty Ltd',
      settlementAmount: 20011,
      lastUpdatedAt: '2021-07-01T13:45:15.000Z',
      settlementStatus: 'SENT',
      lodgementReference: 'Tyro July 1st',
    },
  ],
}

/** "Multiple Settlements Returned": split details with different statuses. */
export const DOC_SPLIT_SETTLEMENT: RawTyroSettlement = {
  clearingPaymentId: 'e6da4a8e-70f3-4156-9b81-f027f061d59e',
  grossAmount: 150032,
  settlementDetails: [
    {
      type: 'EXTERNAL_BANK_ACCOUNT',
      institutionName: 'MyBank',
      bsb: '840300',
      accountNumber: '****9201',
      accountName: 'Potene Enterprises Pty Ltd',
      settlementAmount: 20011,
      lastUpdatedAt: '2021-07-01T13:45:15.000Z',
      settlementStatus: 'SENT',
      lodgementReference: 'Tyro July 1st',
    },
    {
      type: 'EXTERNAL_BANK_ACCOUNT',
      institutionName: 'MyBank',
      bsb: '840300',
      accountNumber: '****9201',
      accountName: 'Potene Enterprises Pty Ltd',
      settlementAmount: 120021,
      settlementStatus: 'PENDING',
      lodgementReference: 'Tyro July 1st',
    },
    { type: 'TYRO_BANK_ACCOUNT' },
  ],
}
