/**
 * Rows copied from the example responses in Paydock's API reference
 * (https://documenter.getpostman.com/view/6912944/Uyr5my5q; JSON at
 * https://documenter.gw.postman.com/api/collections/6912944/Uyr5my5q), with
 * long gateway blobs trimmed.
 */

/** customers/get → "get success" → resource.data */
export const DOC_CUSTOMER = {
  _id: '620628ed41f03d6f3f87fbf1',
  _source_ip_address: '3.106.123.152',
  first_name: 'Test',
  last_name: 'Last',
  company_name: 'Test',
  reference: 'Test',
  user_id: '618d2bca8a08786a53572f13',
  default_source: '620628ef41f03d6f3f87fbf2',
  status: 'active',
  archived: false,
  created_at: '2022-02-11T09:14:23.282Z',
  updated_at: '2022-02-11T09:14:23.282Z',
  statistics: { successful_transactions: 110, total_collected_amount: 6050 },
  payment_sources: [
    {
      _id: '620628ef41f03d6f3f87fbf2',
      type: 'card',
      gateway_id: '618e247c32a6f77fca6e05dc',
      gateway_name: 'Stripe',
      gateway_type: 'Stripe',
      vault_token: '42cda949-7ade-4e5e-b256-56849f86ac81',
      card_name: 'Test User',
      card_number_last4: '4242',
      card_scheme: 'visa',
      address_country: 'AU',
      address_state: 'Test',
      expire_month: 5,
      expire_year: 2022,
      status: 'active',
      created_at: '2022-02-11T09:14:23.174Z',
      updated_at: '2022-02-11T09:14:23.281Z',
      ref_token: 'cus_L8BauNakIhfuEF',
    },
  ],
  payment_destinations: [],
  company_id: '618d2c188a08786a53572f22',
}

/** charges/search → "search with filters" → resource.data[0] */
export const DOC_CHARGE = {
  _id: '5ec63451b12c99579e46ee31',
  created_at: '2020-05-21T07:57:05.911Z',
  updated_at: '2020-05-21T07:57:06.565Z',
  amount: 10,
  currency: 'AUD',
  _source_ip_address: '192.168.0.1',
  transactions: [
    {
      created_at: '2020-05-21T07:57:05.909Z',
      amount: 10,
      currency: 'AUD',
      _id: '5ec63451b12c99579e46ee32',
      status: 'complete',
      type: 'sale',
    },
  ],
  one_off: true,
  archived: false,
  customer: {
    customer_id: '5e4bfbd86d244b438451fbd7',
    first_name: 'Wanda',
    last_name: 'Mertz',
    company_name: 'Hahn Mertz LLC',
    payment_source: {
      source_id: '5e4bfbc96d244b438451fbd6',
      type: 'card',
      card_name: 'Wanda Mertz',
      card_number_last4: '4242',
      card_number_bin: '42424242',
      card_scheme: 'visa',
      expire_month: 12,
      expire_year: 2020,
      address_country: 'AU',
      gateway_id: '5cbede1f151b842653e987be',
    },
  },
  capture: true,
  status: 'complete',
  items: [],
  transfer: { items: [] },
  external_id: 'ch_0Gl9H4jQKtR4Rpd2kZBVPd2l',
}

/** subscriptions/get → "get" → resource.data */
export const DOC_SUBSCRIPTION = {
  _id: '5ef064763dcfec0ac5e0622e',
  created_at: '2020-06-22T07:57:42.963Z',
  updated_at: '2020-06-29T07:58:15.049Z',
  company_id: '5d305bfbfac31b4448c738d7',
  amount: 12,
  status: 'expired',
  user_id: '5d305bfbfac31b4448c738d6',
  latest_charge_id: '5ef99f168bbc123baf1507f4',
  expired_at: '2020-06-29T07:58:15.019Z',
  expired_reason: 'end_date',
  last_change_by: 'automatic',
  archived: false,
  customer: {
    customer_id: '5ef064763dcfec0ac5e0622b',
    first_name: 'Carlie',
    last_name: 'Kuvalis',
    email: 'carlie.kuvalis@example.com',
    phone: '+1234567890',
  },
  statistics: { total_collected_amount: 96, successful_transactions: 8 },
  schedule: {
    interval: 'day',
    start_date: '2020-06-22T07:57:42.066Z',
    end_date: '2020-06-29T21:00:00.000Z',
    status: 'complete',
    frequency: 1,
  },
  currency: 'AUD',
}

/**
 * charges/refund, example response "refund success": the charge with its sale
 * and refund transactions (documented fields only).
 */
export const DOC_REFUND_CHARGE = {
  _id: '5ecd108a51eff9228f882b8b',
  amount: 10,
  currency: 'AUD',
  status: 'refund_requested',
  transactions: [
    {
      _id: '5ecd108a51eff9228f882b8c',
      type: 'sale',
      status: 'complete',
      amount: 10,
      currency: 'AUD',
      created_at: '2020-05-26T12:50:18.579Z',
    },
    {
      _id: '5ecd10c951eff9228f882b95',
      type: 'refund',
      status: 'requested',
      amount: 10,
      currency: 'AUD',
      created_at: '2020-05-26T12:51:21.331Z',
    },
  ],
}
