/**
 * Fixtures copied from the documented examples in SumUp's first-party OpenAPI
 * spec (https://raw.githubusercontent.com/sumup/sumup-openapi/refs/heads/main/openapi.json).
 */
import type { RawSumupTransaction } from '../../../../../../src/verticals/payments/adapters/sumup/transform/charge'
import type { RawSumupPayout } from '../../../../../../src/verticals/payments/adapters/sumup/transform/payout'
import type { RawSumupCustomer } from '../../../../../../src/verticals/payments/adapters/sumup/transform/customer'

/** GET /v2.1/merchants/{merchant_code}/transactions/history — `items[0]` example. */
export const HISTORY_ROW: RawSumupTransaction = {
  transaction_code: 'TEENSK4W2K',
  amount: 10.1,
  currency: 'EUR',
  timestamp: '2020-02-29T10:56:56.876Z',
  status: 'SUCCESSFUL',
  payment_type: 'ECOM',
  installments_count: 1,
  merchant_code: 'MH4H92C7',
  transaction_id: '410fc44a-5956-44e1-b5cc-19c6f8d727a4',
  user: 'merchant@example.com',
  type: 'PAYMENT',
  payout_date: '2019-08-28',
  payout_type: 'BANK_ACCOUNT',
  refunded_amount: 0,
}

/** GET /v2.1/merchants/{merchant_code}/transactions — response example. */
export const TRANSACTION_FULL: RawSumupTransaction = {
  id: '410fc44a-5956-44e1-b5cc-19c6f8d727a4',
  transaction_code: 'TEENSK4W2K',
  amount: 10.1,
  currency: 'EUR',
  timestamp: '2020-02-29T10:56:56.876Z',
  status: 'SUCCESSFUL',
  payment_type: 'ECOM',
  installments_count: 1,
  merchant_code: 'MH4H92C7',
  vat_amount: 6,
  tip_amount: 3,
  entry_mode: 'CUSTOMER_ENTRY',
  auth_code: '053201',
}

/** GET /v1.0/merchants/{merchant_code}/payouts — response example `[0]`. */
export const PAYOUT_ROW: RawSumupPayout = {
  amount: 132.45,
  currency: 'EUR',
  date: '2024-02-29',
  fee: 3.12,
  id: 123456789,
  reference: 'payout-2024-02-29',
  status: 'SUCCESSFUL',
  transaction_code: 'TEENSK4W2K',
  type: 'PAYOUT',
}

/** `Customer` / `PersonalDetails` schema examples. */
export const CUSTOMER: RawSumupCustomer = {
  customer_id: '831ff8d4cd5958ab5670',
  personal_details: {
    first_name: 'John',
    last_name: 'Doe',
    email: 'user@example.com',
    phone: '+491635559723',
  },
}
