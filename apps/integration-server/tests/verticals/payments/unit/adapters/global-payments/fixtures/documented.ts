/**
 * Fixtures copied from the GP-API reference pages' embedded OpenAPI.
 *
 * TRANSACTION_LIST_PAGE is the first row of the "Get List of Transactions"
 * example of GET /transactions
 * (https://developer.globalpayments.com/api/transactions), trimmed of the
 * empty nested blocks the adapter does not read.
 *
 * DEPOSIT is built from the per-field `example` values of the GET
 * /settlement/deposits/{id} response schema
 * (https://developer.globalpayments.com/api/settlement-reporting), which
 * ships no whole-response example.
 */
import type { RawGlobalPaymentsTransaction } from '../../../../../../../src/verticals/payments/adapters/global-payments/transform/charge'
import type { RawGlobalPaymentsDeposit } from '../../../../../../../src/verticals/payments/adapters/global-payments/transform/payout'

export const TRANSACTION: RawGlobalPaymentsTransaction = {
  id: 'TRN_M2lwGiHmpKsrWAtF8sHX3ouWlbqU0Y',
  time_created: '2026-03-01T05:12:10.808Z',
  account_id: 'TRA_1e0a2fdfd79d4013b87d47c4c43882f6',
  account_name: 'Portico_Transaction_Processing',
  status: 'PREAUTHORIZED',
  type: 'SALE',
  channel: 'CNP',
  amount: '2000',
  partner_amount: '',
  merchant_amount: '',
  gratuity_amount: '0',
  currency: 'USD',
  reference: 'TRANS-b6467ddc-0e27-4f64-b0b1-ecfaf51946df',
  description: '',
  order_reference: '',
  order: { reference: '' },
  batch_id: 'BAT_1234',
  country: 'US',
  site_reference: '',
  payment_method: {
    result: '00',
    message: 'APPROVAL',
    entry_mode: 'ECOM',
    name: 'Jone Doe',
    card: {
      brand: 'VISA',
      authcode: 'VI2000',
      brand_reference: 6060440009130,
      masked_number_first6last4: '426397XXXXXX5262',
    },
  },
  action_create_id: 'ACT_M2lwGiHmpKsrWAtF8sHX3ouWlbqU0Y',
  parent_resource_id: 'TRN_M2lwGiHmpKsrWAtF8sHX3ouWlbqU0Y',
  system: { mid: '4888888123457', tid: '6561', name: 'Portico Testing platform' },
}

export const DEPOSIT: RawGlobalPaymentsDeposit = {
  id: 'DEP_2342423423',
  time_created: '2021-05-03',
  status: 'FUNDED',
  funding_type: 'DEBIT',
  amount: '500',
  currency: 'USD',
  aggregation_model: '4-No Summary',
  bank_transfer: { bank: { code: '124002971' } },
  system: { name: 'MERCHANT ABC INC.', dba: 'MERCHANT XYZ INC' },
  sales: { count: 123, amount: '120' },
  refunds: { count: 123, amount: '120' },
  fees: { amount: '120' },
}
