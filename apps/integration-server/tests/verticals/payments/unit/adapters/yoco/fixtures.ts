/**
 * Fixtures copied from the example responses on Yoco's first-party API
 * reference pages:
 *   https://developer.yoco.com/api-reference/yoco-api/payments/list-payments-v-1-payments-get.md
 *   https://developer.yoco.com/api-reference/yoco-api/refunds/list-refunds-v-1-refunds-get.md
 *   https://developer.yoco.com/api-reference/yoco-api/payouts/list-payouts-v-1-payouts-get.md
 *   https://developer.yoco.com/api-reference/yoco-api/payouts/list-payout-entries-v-1-payouts-payout-id-payout-entries-get.md
 */
import type { RawYocoPayment } from '../../../../../../src/verticals/payments/adapters/yoco/transform/charge'
import type { RawYocoRefund } from '../../../../../../src/verticals/payments/adapters/yoco/transform/refund'
import type { RawYocoPayout } from '../../../../../../src/verticals/payments/adapters/yoco/transform/payout'
import type { RawYocoPayoutEntry } from '../../../../../../src/verticals/payments/adapters/yoco/transform/balance-transaction'

export const REFUND: RawYocoRefund = {
  client_transaction_id: 'rfd_765fde5ded7bxd',
  created_at: '2024-11-19T15:27:02+00:00',
  currency: 'ZAR',
  display_name: 'Refund receipt #491352',
  id: '1732188199292-2a8752ab-db45-4507-9d85-fcc6049beef3',
  note: 'This is a note on this refund.',
  order_id: '1585232943682-9f7e2dbe-a09e-4fa8-aa4a-72290c513f1d',
  order_number: 'string',
  original_order_id: '1585232943682-9f7e2dbe-a09e-4fa8-aa4a-72290c513f1d',
  original_order_number: '10542623',
  payment_id: '1732194482873-c777dc85-035e-40de-9820-765fde5ded7b',
  payment_method: 'card',
  processed_at: '2024-11-20T16:27:23+00:00',
  processing_fees: [{ amount: { amount: 27800, currency: 'ZAR' }, type: 'initial' }],
  receipt_number: '491352',
  refund_type: 'auth_reversal',
  refunded_processing_fees: [{ amount: { amount: 27800, currency: 'ZAR' }, type: 'initial' }],
  status: 'approved',
  total_amount: { amount: 4500, currency: 'ZAR' },
  updated_at: '2024-11-19T16:27:23+00:00',
  staff_id: '1739522553-a7769044-ff8c-410d-b660-84e6727c70b9',
}

export const PAYMENT: RawYocoPayment = {
  amount_excl_tip: { amount: 25000, currency: 'ZAR' },
  checkout_id: 'ch_J2xYWl4m7B6DsKAPCM9SRDEd',
  client_transaction_id: '5f29b4cf-5650-4c71-b7e5-f70eb892e55f',
  created_at: '2024-11-19T15:27:02+00:00',
  currency: 'ZAR',
  display_name: 'Payment receipt #491352',
  id: '1732194482873-c777dc85-035e-40de-9820-765fde5ded7b',
  note: 'This is a note on this payment.',
  order_id: '1585232943682-9f7e2dbe-a09e-4fa8-aa4a-72290c513f1d',
  payment_method: 'card',
  payment_source: 'payment_link',
  processing_fees: [{ amount: { amount: 1500, currency: 'ZAR' }, type: 'initial' }],
  receipt_number: '491352',
  refunded_amount: { amount: 0, currency: 'ZAR' },
  refunds: [REFUND],
  status: 'approved',
  tip_amount: { amount: 2500, currency: 'ZAR' },
  total_amount: { amount: 27500, currency: 'ZAR' },
  updated_at: '2024-11-19T16:27:23+00:00',
  card_machine_id: '1743683416648-616bc018-c572-430b-9c07-4e813ed03eb4',
  external_id: 'order-123',
  staff_id: '1739522553-a7769044-ff8c-410d-b660-84e6727c70b9',
}

export const PAYOUT: RawYocoPayout = {
  capital_repayment_amount: { amount: 250, currency: 'ZAR' },
  created_at: '2024-11-19T15:27:02+00:00',
  fee_amount: { amount: 350, currency: 'ZAR' },
  gross_amount: { amount: 12000, currency: 'ZAR' },
  id: '1744288539-57db0a32-3cae-40af-a328-b22a09cfcb94',
  net_amount: { amount: 11400, currency: 'ZAR' },
  payout_fees: [{ amount: { amount: 27800, currency: 'ZAR' }, type: 'initial' }],
  payout_type: 'standard',
  status: 'paid',
  updated_at: '2024-11-19T16:27:23+00:00',
}

export const PAYOUT_ENTRY: RawYocoPayoutEntry = {
  capital_repayment_amount: { amount: 250, currency: 'ZAR' },
  client_transaction_id: 'rfd_765fde5ded7bxd',
  fee_amount: { amount: 350, currency: 'ZAR' },
  gross_amount: { amount: 12000, currency: 'ZAR' },
  id: '1744289052-a70682ae-7376-404c-9859-3aa100322fa0',
  net_amount: { amount: 11400, currency: 'ZAR' },
  payout_id: '1744288539-57db0a32-3cae-40af-a328-b22a09cfcb94',
  type: 'payment',
}
