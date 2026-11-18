/**
 * TrueLayer Payments API v3 fixtures, built from the documented shapes.
 *
 * Transaction rows follow the example response on
 * https://docs.truelayer.com/docs/get-your-merchant-account-transactions-or-payment-sources
 * (the example's placeholder "string" timestamps and 0 amounts replaced with
 * valid values: `amount_in_minor` is `minimum: 1` in TransactionCommon). The
 * payout resource is the "External account" example of GET /v3/payouts/{id}
 * (https://docs.truelayer.com/reference/get-payout). The payment resource is
 * built from GetPayment's PaymentSettled / PaymentFailed schemas
 * (https://docs.truelayer.com/reference/get-payment-1), which ship no example.
 */

const ACCOUNT_IDENTIFIERS = [
  { type: 'sort_code_account_number', sort_code: '560029', account_number: '26207729' },
  { type: 'iban', iban: 'GB32CLRB04066800012315' },
]

export const MERCHANT_ACCOUNT_PAYMENT = {
  type: 'merchant_account_payment',
  id: 'a1f3c3f1-6d1b-4ab5-8f3a-1c2d3e4f5a6b',
  currency: 'GBP',
  amount_in_minor: 1250,
  status: 'settled',
  settled_at: '2024-04-10T13:13:40Z',
  payment_source: {
    id: 'e2b41c9d-176k-67aa-b2da-fe1a2b97253c',
    account_holder_name: 'John Doe',
    account_identifiers: ACCOUNT_IDENTIFIERS,
  },
  payment_id: '0afd1f6a-f611-48ce-9488-321129bb3a70',
  metadata: { prop1: 'value1' },
} as const

export const EXTERNAL_PAYMENT = {
  type: 'external_payment',
  id: 'b2e4d4a2-7e2c-4bc6-9a4b-2d3e4f5a6b7c',
  currency: 'GBP',
  amount_in_minor: 500,
  status: 'settled',
  settled_at: '2024-04-10T14:00:00Z',
  remitter: {
    account_holder_name: 'Jane Doe',
    reference: 'top-up',
    account_identifiers: ACCOUNT_IDENTIFIERS,
  },
} as const

export const PAYOUT_TRANSACTION = {
  type: 'payout',
  id: '0cd1b0f7-71bc-4d24-b209-95259dadcc20',
  currency: 'GBP',
  amount_in_minor: 100,
  status: 'executed',
  created_at: '2021-12-25T14:00:00.000Z',
  executed_at: '2021-12-25T15:00:00.000Z',
  beneficiary: {
    type: 'external_account',
    reference: 'a-reference',
    account_holder_name: 'John Doe',
    account_identifiers: ACCOUNT_IDENTIFIERS,
  },
  context_code: 'withdrawal',
  payout_id: '0cd1b0f7-71bc-4d24-b209-95259dadcc20',
  metadata: { prop1: 'value1', prop2: 'value2' },
} as const

export const REFUND_TRANSACTION = {
  type: 'refund',
  id: 'c3f5e5b3-8f3d-4cd7-ab5c-3e4f5a6b7c8d',
  currency: 'GBP',
  amount_in_minor: 250,
  status: 'executed',
  created_at: '2024-04-11T10:00:00Z',
  executed_at: '2024-04-11T10:05:00Z',
  beneficiary: {
    type: 'payment_source',
    payment_source_id: 'e2b41c9d-176k-67aa-b2da-fe1a2b97253c',
    user_id: 'f9b48c9d-176b-46dd-b2da-fe1a2b77350c',
    reference: 'refund',
    account_holder_name: 'John Doe',
    account_identifiers: ACCOUNT_IDENTIFIERS,
  },
  context_code: 'withdrawal',
  refund_id: '43d12d0f-d775-410f-aaff-482200c17017',
  payment_id: '0afd1f6a-f611-48ce-9488-321129bb3a70',
} as const

/** GET /v3/payouts/{id}, the documented "External account" example. */
export const PAYOUT = {
  id: '0cd1b0f7-71bc-4d24-b209-95259dadcc20',
  merchant_account_id: 'ae094a73-d874-4241-a65f-6dcda7ac07b1',
  amount_in_minor: 100,
  currency: 'GBP',
  beneficiary: {
    type: 'external_account',
    reference: 'a-reference',
    account_holder_name: 'John Doe',
    account_identifiers: [
      { type: 'sort_code_account_number', sort_code: '123456', account_number: '12345678' },
    ],
  },
  scheme_id: 'faster_payments_service',
  created_at: '2021-12-25T14:00:00.000Z',
  status: 'executed',
  executed_at: '2021-12-25T15:00:00.000Z',
  metadata: { prop1: 'value1', prop2: 'value2' },
} as const

/** GET /v3/payments/{id}, a PaymentSettled. */
export const PAYMENT_SETTLED = {
  id: '0afd1f6a-f611-48ce-9488-321129bb3a70',
  amount_in_minor: 1250,
  currency: 'GBP',
  payment_method: { type: 'bank_transfer' },
  beneficiary: {
    type: 'merchant_account',
    merchant_account_id: 'ae094a73-d874-4241-a65f-6dcda7ac07b1',
  },
  created_at: '2024-04-10T13:00:00.000Z',
  status: 'settled',
  executed_at: '2024-04-10T13:05:00.000Z',
  settled_at: '2024-04-10T13:13:40.000Z',
  payment_source: {
    id: 'e2b41c9d-176k-67aa-b2da-fe1a2b97253c',
    account_holder_name: 'John Doe',
    account_identifiers: ACCOUNT_IDENTIFIERS,
  },
  metadata: { prop1: 'value1' },
} as const

/** GET /v3/payments/{id}, a PaymentFailed (`failure_stage`, `failure_reason` required). */
export const PAYMENT_FAILED = {
  ...PAYMENT_SETTLED,
  status: 'failed',
  failed_at: '2021-12-25T15:00:00.000Z',
  failure_stage: 'authorizing',
  failure_reason: 'provider_rejected',
} as const
