/**
 * Tink documented examples, copied verbatim from the API reference
 * (https://docs.tink.com/api#payment/settlement-accounts, rendered in
 * https://docs.tink.com/assets/ApiReferenceSectionLazy-DUqT4U4u.js) and the
 * access-token guide (https://docs.tink.com/resources/api-setup/get-access-token).
 */

/** "Get transaction" / "List transactions" Response Example (the one row). */
export const TRANSACTION = {
  accountBalance: { currencyCode: 'GBP', value: { scale: '2', unscaledValue: '400' } },
  amount: { currencyCode: 'GBP', value: { scale: '2', unscaledValue: '12300' } },
  id: '817465f1-adbf-493b-bf7e-d167c39289ba',
  merchantId: 'bef35277-ec45-4445-a153-05dbb42390df',
  metadata: { key1: 'value1', key2: 'value2' },
  originalTransactionId: '',
  payee: {
    account: { identifier: '00000070438944', type: 'SORT_CODE' },
    beneficiaryId: 'd502bbff-8e44-49ee-bab6-093a0d1787e2',
    name: 'John Smith',
  },
  payer: {
    account: { identifier: '00000070438943', type: 'SORT_CODE' },
    beneficiaryId: 'd502bbff-8e44-49ee-bab6-093a0d1787ed',
    name: 'John Smith',
  },
  paymentRequestId: 'a4d82dd0901411ed9f8787175ad2c3e2',
  reference: 'Wdr7ad0feabb4ab',
  timestamp: '2021-07-14T14:01:53Z',
  type: 'PAYIN',
  verificationStatus: 'EXACT_MATCH',
}

/** "List transactions" Response Example envelope. */
export const LIST_TRANSACTIONS = {
  nextPageToken: 'MA=',
  prevPageToken: 'MA==',
  totalSize: '1',
  transactions: [TRANSACTION],
}

/** "Get refund" / "List refunds" Response Example (the one row). */
export const REFUND = {
  accountId: '161ec210-721f-4df5-b21c-f78a9d4c1545',
  amount: { currencyCode: 'EUR', value: { scale: '2', unscaledValue: '5000' } },
  createdTime: '2022-07-14T14:01:53Z',
  id: 'b58d313a-b778-4639-8e31-c9ffc35e2d01',
  merchantId: 'e06e47f1-8c88-47ee-9415-a4cde72ae598',
  metadata: { key1: 'value1', key2: 'value2' },
  reference: 'Refund7ad0feabb4ab',
  scheme: 'SEPA_INSTANT_CREDIT_TRANSFER',
  status: 'COMPLETED',
  transactionId: '7ad0feab-bd55-449d-aa7e-b3d3b9c62550',
  updatedTime: '2022-07-14T14:08:53Z',
}

/** "List refunds" Response Example envelope. */
export const LIST_REFUNDS = {
  nextPageToken: 'MA=',
  prevPageToken: 'MA==',
  refunds: [REFUND],
  totalSize: '1',
}

/** "Get account" Response Example. */
export const ACCOUNT = {
  accountIdentifier: { identifier: '00000012345678', type: 'SORT_CODE' },
  appId: '',
  availableBalance: { currencyCode: 'GBP', value: { scale: '2', unscaledValue: '271100' } },
  balance: { currencyCode: 'GBP', value: { scale: '2', unscaledValue: '276400' } },
  countryCode: 'GB',
  currencyCode: 'GBP',
  id: '744cf927-29cd-475e-9ef2-2b11951d3cc9',
  merchantId: '2c9ba5fd-cbdb-4ed5-84a4-01db5698f0d9',
  name: 'Account name',
  payoutAccount: {
    currencyCode: 'GBP',
    frequency: 'MONTHLY',
    identifier: { identifier: '00000070438943', type: 'SORT_CODE' },
  },
  reservedAmount: { scale: '1', unscaledValue: '100' },
  status: 'ENABLED',
  type: 'APP_ACCOUNT',
}

/** Client access-token response example (placeholder token replaced). */
export const CLIENT_TOKEN = {
  access_token: 'client-access-token',
  token_type: 'bearer',
  expires_in: 1800,
  scope: 'settlement-accounts:readonly',
}
