/**
 * Fixtures copied from the documented example responses in Solidgate's
 * OpenAPI bundle (https://api-docs.solidgate.com/_bundle/api/@v1/index.json?download).
 */

/** retrieve-card-orders, example "Success", `orders[0]`. */
export function cardOrder() {
  return {
    order_id: '923bb4e6-4a5f-41ec-81fb-28eb8a152e55',
    order_description: 'Premium package',
    psp_order_id: '854756336423874823bdfsg6743gf5',
    provider_payment_id: 'charge_64789DFS3827563HGF56',
    product_id: 'a12b3c4d-5678-90ab-cdef-1234567890ab',
    product_name: 'Premium package',
    product_type: 'recurring',
    subscription_id: 'b64f6196-5d39-47a8-9bfa-3a39501c6c44',
    created_at: '2026-07-15 11:45:30',
    updated_at: '2026-07-16 11:45:30',
    amount: 100,
    currency: 'USD',
    processing_amount: 10,
    processing_currency: 'USD',
    settled_amount: 0,
    settled_currency: null,
    refunded_amount: 0,
    refunded_currency: null,
    status: 'processing',
    refund: null,
    payment_type: 'recurring',
    payment_method: 'token',
    type: 'recurring',
    is_secured: true,
    customer_account_id: '93a1c659-288d-4d62-929d-10e241078faa',
    customer_email: 'example@example.com',
    customer_first_name: 'Nikola',
    customer_last_name: 'Tesla',
    mid: 'bank-mid-1',
    ip_address: '203.0.113.0',
    traffic_source: 'facebook',
    platform: 'MOB',
    geo_country: 'USA',
    error_code: '3.02',
    transactions: [
      {
        id: '5019d00bb70f82cd42f6bc654cbdfcbd63a9b5b1dbd6a',
        created_at: '2026-07-15 11:45:30',
        updated_at: '2026-07-16 11:45:30',
        amount: 100,
        currency: 'USD',
        operation: 'recurring',
        status: 'processing',
        authorization_type: 'final',
        original_payment_method: 'apple-pay',
        descriptor: 'google.com',
        refund_reason: 'Solidgate - Issuer Fraud Notification',
        refund_reason_code: '0022',
        card: {
          bank: 'JSC UNIVERSAL BANK',
          bin: '444111',
          brand: 'VISA',
          card_exp_month: '12',
          card_exp_year: 2030,
          card_holder: 'John Snow',
          card_type: 'CREDIT',
          card_id: '22733af4-f6c6-4368-b7d0-98aeb0253a57',
          country: 'USA',
          number: '444111XXXXXX9435',
        },
      },
    ],
    order_metadata: { coupon_code: 'NY2025', partner_id: '123989' },
  }
}

/** retrieve-card-chargebacks, example "Success", `orders[0].chargebacks[0]`. */
export function chargeback() {
  return {
    id: '892140',
    created_at: '2025-08-18 09:57:49',
    updated_at: '2025-08-18 09:57:49',
    dispute_date: '2025-08-18 09:57:49',
    settlement_date: '2025-08-18 09:57:49',
    amount: 100,
    currency: 'USD',
    type: '1st_chb',
    status: 'reversed',
    reason_group: 'Fraud',
    reason_code: '10.4',
    reason_description: 'Fraud – Card-Absent Environment',
    flows: [
      {
        id: '1159271',
        date: '2025-08-18 00:00:00',
        created_at: '2025-08-18 09:57:48',
        updated_at: '2025-08-18 09:57:49',
        settlement_date: '2025-08-18 00:00:00',
        deadline_date: '2025-08-28 00:00:00',
        amount: 100,
        dispute_amount: 100,
        currency: 'USD',
        type: '1st_chb',
        status: 'in_progress',
        represented_by: 'merchant',
        arn_code: '24871153022084127852235',
      },
    ],
  }
}

/** retrieve-subscriptions, example "Success", the one `subscriptions` value. */
export function subscription() {
  return {
    id: '64e1c283-17bf-45a7-90ea-2cb938081b2f',
    status: 'cancelled',
    updated_at: '2025-06-10 15:42:25',
    started_at: '2025-06-10 15:42:24',
    expired_at: '2025-09-10 16:42:24',
    next_charge_at: '2025-11-26 11:43:52',
    payment_type: 'paypal-vault',
    trial: true,
    cancelled_at: '2025-06-26 06:43:58',
    cancel_code: '8.01',
    cancel_message: 'Card brand is not supported',
    customer: {
      customer_account_id: '93a1c659-288d-4d62-929d-10e241078faa',
      customer_email: 'example@example.com',
    },
    product: {
      id: 'a51ba9fd-3be1-4ef9-b00f-bb85157597f5',
      name: 'Platinum Audiobook Set',
      payment_action: 'auth_void',
      amount: 100,
      currency: 'USD',
      trial: true,
      trial_period: 1,
    },
    invoices: {},
  }
}

/** get-products, example "Subscription payment", `data[0]`. */
export function recurringProduct() {
  return {
    id: 'cb43b415-5522-4373-b026-a365462f9114',
    name: 'Luxury product',
    type: 'recurring',
    description: 'This product is the best product all over the world',
    public_description: 'That cool product that you have bought',
    status: 'active',
    created_at: '2025-05-31 12:53:12',
    updated_at: '2025-05-31 12:53:13',
    term_length: 20,
    payment_action: 'auth_settle',
    settle_interval: 48,
    billing_period: { unit: 'day', value: 10 },
    trial: {
      billing_period: { unit: 'day', value: 10 },
      payment_action: 'auth_settle',
      settle_interval: 48,
    },
    retry_mode: 'static',
    retry_strategy_id: 'db43b415-5522-4373-b026-a365462f9439',
    tax: { category_id: 'taxc_01JJVD231C879QBHVTVCWJ1K2A', behavior: 'included' },
    metadata: { access_duration: '30d', plan_tier: 'premium' },
  }
}

/** get-products, example "Product-based payment", `data[0]`. */
export function oneTimeProduct() {
  return {
    id: 'cb43b415-5522-4373-b026-a365462f9114',
    name: 'Luxury product',
    type: 'one-time',
    description: 'This product is the best product all over the world',
    public_description: 'That cool product that you have bought',
    status: 'active',
    created_at: '2025-05-31 12:53:12',
    updated_at: '2025-05-31 12:53:13',
    payment_action: 'auth_settle',
    settle_interval: 48,
    tax: { category_id: 'taxc_01JJVD231C879QBHVTVCWJ1K2A', behavior: 'included' },
    metadata: { access_duration: '30d', plan_tier: 'premium' },
  }
}

/** get-product-prices, `data[]` item schema examples. */
export function price() {
  return {
    id: 'cb43b415-5522-4373-b026-a365462f9114',
    default: false,
    status: 'active',
    created_at: '2025-05-31 12:53:12',
    updated_at: '2025-05-31 12:53:13',
    product_price: 1000,
    trial_price: 500,
    currency: 'USD',
    country: 'USA',
  }
}
