/**
 * Fixtures copied from the documented example responses.
 *
 * SALES_ROW: GET /reports/sales, 201 "Result" example, data.report[0]
 * (https://developers.upayments.com/reference/sales-report.md).
 * TRANSACTION: GET /get-payment-status/{track_id}, 201 "Result" example,
 * data.transaction (https://developers.upayments.com/reference/checkpaymentstatus.md).
 */
import type {
  RawUpaymentsSalesRow,
  RawUpaymentsTransaction,
} from '../../../../../../src/verticals/payments/adapters/upayments/transform/charge'

export const SALES_ROW: RawUpaymentsSalesRow = {
  order_id: '0198f00c2966e30a7c7f33edc6ec4370',
  track_id: '0198f00c2966e30a7c7f33edc6ec436fv2',
  transaction_id: 'fcb601cd-f9b4-4e19-9ab8-002be06d8a9e',
  date: '2025-08-28T09:39:45.000000Z',
  customer: {
    name: 'Juliette Bonilla',
    email: 'juliette.bonilla@upayments.com',
    mobile: '+96566336537',
  },
  products: [
    {
      name: 'Logitech K380 / Easy-Switch for Upto 3 Devices, Slim Bluetooth Tablet Keyboar',
      sku: '',
      quantity: 1,
      price: 10,
      total: '10.000',
      variants: null,
      tags: [],
    },
  ],
  address: {
    country: null,
    area: null,
    block: null,
    street: null,
    building: null,
    floor: null,
    apartment: null,
    notes: null,
  },
  sub_total: '0.010',
  delivery_charges: '0.000',
  discount: '0.000',
  discount_code: null,
  discount_code_amount: '0.000',
  grand_total: '0.010',
  currency: 'KWD',
  amount_paid: '0.010',
  refunded_amount: null,
  charges: '0.000',
  deposited: 0,
  deposited_date: null,
}

export const TRANSACTION: RawUpaymentsTransaction = {
  order_id: '9bf8387beea04c368be502649d3fcbc8',
  refund_order_id: '9bf8387beea04c368be502649d3fcbc8',
  payment_id: '100412610000005799',
  result: 'CAPTURED',
  payment_type: 'knet',
  track_id: '9bf8387bd32d45dda56f6c1c009eca4f',
  transaction_date: '2024-05-05 13:14:01',
  is_save_card: false,
  from_plugin: false,
  reference: '202210101202210101',
  total_paid_non_kwd: '20.000',
  total_price: '20.000',
  currency_type: 'KWD',
  status: 'done',
  session_id: 'de561c446f23ff03884dde2c81707219',
  whitelabled: true,
  customer_id: 2962509,
  customer_unique_id: '2129879kjbljg767881',
  merchant_requested_order_id: '202210101255255144669',
  extra_merchants_data: null,
  is_paid_from_knet: true,
  is_paid_from_cc: false,
  is_from_nbk: false,
  customer_extra_data: 'User define data',
  created_at: '2024-05-05 13:14:01',
}
