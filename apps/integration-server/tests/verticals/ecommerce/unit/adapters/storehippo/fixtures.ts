/**
 * StoreHippo fixtures built from the first-party API reference
 * (https://help.storehippo.com/api/reference/<alias>, served as the docs
 * site data at https://help.storehippo.com/api/1.1/entity/ms.apis2 with
 * relations=[{"name":"commands"}]). Values are the documented field
 * examples; ORDER, ORDER_GET and FULFILLMENT are the documented example
 * responses verbatim, minus the embedded `product` / `seller_details`
 * objects the transforms do not read. Where a documented field has no
 * example (REFUND's mode, note, transaction_info, amount_refunded and
 * created_on; DEFAULT_CURRENCY's name and `default`), the value is a TEST
 * VALUE of the documented type, not a documented example.
 */

/** ms-products: field examples; `variants` is the documented example verbatim. */
export const PRODUCT = {
  _id: '5c3f3c724b99c515ee8f53d8',
  name: 'Floral shirt',
  alias: 'floral-shirt',
  description: 'Regular fit, cotton floral shirt',
  price: 2000,
  compare_price: 1542,
  brand: 'Lee Cooper',
  sku: 'shirt-floral',
  inventory_quantity: 23,
  publish: '1',
  options: [
    { name: 'Fit Size', values: ['S-39', 'M-40', 'L-42', 'XL-44'] },
    { name: 'Color', values: ['red', 'black', 'blue'] },
  ],
  variants: [
    {
      price: '300',
      compare_price: '350',
      sku: 'TSHIRT_BLUE',
      inventory_management: 'automatic',
      inventory_quantity: 2,
      options: [
        {
          name: 'color',
          value: 'blue',
        },
      ],
      variant_id: 'blue',
    },
    {
      price: '400',
      compare_price: '450',
      sku: 'TSHIRT_GOLD',
      inventory_management: 'automatic',
      inventory_quantity: 0,
      options: [
        {
          name: 'color',
          value: 'gold',
        },
      ],
      variant_id: 'gold',
    },
  ],
  created_on: '2020-05-08T11:04:21.355Z',
}

/** ms-categories: field examples; `_id` from the add example response. */
export const CATEGORY = {
  _id: '5d4d5393b6455f39d99da051',
  name: "Women's Apparels",
  alias: 'women-apparels',
  description: 'Trendy apparels for women.',
  parent: 'Apparels',
  publish: '1',
  default_sort_order: 'By date: Newest to oldest',
}

/** ms-users: the login example response plus the created_on field example. */
export const USER = {
  _id: '5d81e23701808dd8dfe3201f',
  first_name: 'John',
  last_name: 'Neon',
  email: 'john@storehippo.com',
  use_temporary_password: '0',
  phone: '+91987654321',
  role: 'member',
  active: '1',
  created_on: '2014-08-26T12:09:05.008Z',
}

/** ms-orders "list orders" example response, first record. */
export const ORDER = {
  _id: '55bef9159cad703e28e43b5e',
  order_id: 'OID221',
  items: [
    {
      _id: '55bc94ade2b2ac2728d4e827',
      name: 'Polka Dot Shirt /TSF3447',
      product_id: '554764ca0553a0bc62500152',
      product_url: '/product/polka-dot-shirt-tsf3447',
      metafields: {
        size: 'size_charts/554c73f5a84106ea74fa8de9/554c73e46e5bae4c19946f6c.jpg',
        size_chart: 'size_charts/554c73f5a84106ea74fa8de9/554c73e46e5bae4c19946f6c.jpg',
      },
      weight: '150',
      selected_options: {
        color: 'White',
        size: 'L',
      },
      variant_id: 'White|L',
      vendor: null,
      price: '399.60',
      list_price: 999,
      discounts_percentage: '60.00',
      discounts_total: '599.40',
      discounts: [
        {
          _id: '558a4186eeef6dd956381aab',
          name: 'Sale',
          saved_amount: 599.4,
        },
      ],
      taxes: [],
      taxes_total: '0.00',
      thumbnail_url:
        'ms.products/554764ca0553a0bc62500152/images/554764ca0553a0bc62500153/5547653b0553a0bc6250029a/5547653b0553a0bc6250029a-100x100.jpg',
      image_url:
        'ms.products/554764ca0553a0bc62500152/images/554764ca0553a0bc62500153/5547653b0553a0bc6250029a/5547653b0553a0bc6250029a-1024x1024.jpg',
      discount_total: '599.40',
      quantity: 1,
      sub_total: '999.00',
      total: '399.60',
    },
  ],
  sub_total: '399.60',
  total: 448.6,
  item_count: 1,
  status: 'open',
  financial_status: 'Paid',
  delivery_status: null,
  shipping_status: 'Ready to ship',
  cart_id: '55bc92039cad703e28e40ff7',
  email: 'charmingme.s@gmail.com',
  user_id: null,
  discounts: [],
  discount_total: 0,
  discounts_total: 0,
  shipping_method: {
    _id: '555065f48d3b90e43b45ec40',
    name: 'Delivery Charges',
    price: 49,
    discounts_total: 0,
    discounts_percentage: 0,
  },
  shipping_method_name: 'Delivery Charges',
  shipping_total: '49.00',
  currency: {
    name: 'INR',
    conversion_rate: '1',
  },
  taxes: [],
  taxes_total: '0.00',
  gift_cards: [],
  gift_card_total: '0.00',
  ecoupon: {},
  options: {},
  billing_address: {
    country: 'IN',
    full_name: 'Sreya Ray',
    address: 'No 33 and 33/1 Krishna Reddy Colony,Domlur Layout',
    city: 'Bangalore',
    state: 'Karnataka',
    zip: '560071',
    phone: '7259004793',
  },
  shipping_address: {
    country: 'IN',
    full_name: 'Sreya Ray',
    address: 'No 33 and 33/1 Krishna Reddy Colony,Domlur Layout',
    city: 'Bangalore',
    state: 'Karnataka',
    zip: '560071',
    phone: '7259004793',
  },
  additional_charges: [],
  metafields: {},
  price_type: 'inclusive',
  txn_id: 'vPBCEX853',
  channel: 'user',
  payment_method: {
    type: 'payment_gateways',
    enabled: '1',
    settings: {
      gateways: [
        {
          id: 42071,
          gateway: 'ccavenue',
          gateway_options: {
            key: 'tzese3kh3cwkz4k9mu48cdeo2bwfngg2',
            merchantid: 'M_raj20967_20967',
          },
        },
      ],
      gateway: 'ccavenue',
    },
    name: 'Online Payment',
    _id: '5433c08a8d72182379836d04',
    image: 'ms.settings/5256837ccc4abf1d39000001/551e517c838b165e08011f7d.gif',
    _metadata: {
      image: {
        _id: '551e517c838b165e08011f7d',
        name: 'ccavenue_logo.gif',
        size: 3162,
        type: 'image/gif',
      },
    },
  },
  balance_amount: 0,
  wallets: [],
  invoice_number: null,
  client_details: {
    appCodeName: 'Mozilla',
    appName: 'Netscape',
    appVersion:
      '5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.125 Safari/537.36',
    platform: 'Win32',
    cookieEnabled: true,
    languages: ['en-US', 'en'],
    device: 'WEB',
  },
  version: 'ms.0.3.0',
  created_on: '2015-08-03T05:16:05.021Z',
  updated_on: '2015-08-03T09:43:08.162Z',
  fulfillments: [
    {
      tracking_number: '781082161340',
      tracking_company: 'shippo- FEDEX',
      service: 'FEDEX_EXPRESS_SAVER',
      method: 'regular',
      price: '68.40',
      status: 'Ready to ship',
      _id: '55bf37ac7325c0f42e19b750',
    },
  ],
  shipping_label:
    '//cdn.storehippo.com/s/54f3fe54e8e5022a0edeebda/ms.shipping/55bf37aa7325c0f42e19b747_shipping.pdf',
  PickupConfirmationNumber: '131',
  Location: 'DAEA',
  _updated_by: '55018ee9b8f738e77f9fd195',
}

/** ms-orders "Retrieve a Single Order" example response `data`. */
export const ORDER_GET = {
  _id: '5eba49392150fba9a26b57c1',
  items: [
    {
      _id: '5eba49392150fba9a26b57bb',
      name: 'Peach Mandarin Neck Embroidered Kurta',
      product_id: '5eb53cb119e5a564d4527d8a',
      product_url: '/product/peach-mandarin-neck-embroidered-kurta',
      metafields: {
        style_code: '20FES10543-213048',
      },
      seller: '5bfbd39c0790f66e158b0be7',
      price: '2499',
      list_price: 2499,
      quantity: 1,
      discounts_percentage: '0',
      discounts_total: '0',
      discounts: [],
      taxes: [],
      taxes_total: 0,
      shipping_cost: 0,
      total: 2499,
      thumbnail_url:
        'ms.products/5eb53cb119e5a564d4527d8a/images/5eb53cb119e5a564d4527d8b/5eb53cb319e5a564d4527de0/5eb53cb319e5a564d4527de0-120x120.jpg',
      image_url:
        'ms.products/5eb53cb119e5a564d4527d8a/images/5eb53cb119e5a564d4527d8b/5eb53cb319e5a564d4527de0/5eb53cb319e5a564d4527de0-1024x1024.jpg',
      total_tax: 0,
      total_with_tax: 2499,
    },
  ],
  sub_total: 2499,
  total: 2499,
  item_count: '1',
  email: 'jamesjohn@gmail.com',
  user_id: '5e1ec5203735093314764ce4',
  billing_address: {
    address: 'B4-309 Spaze iTech Park, Sector-49, Sohna Road',
    city: 'Gurgoan',
    country: 'IN',
    full_name: 'Testing',
    phone: '1234567890',
    state: 'Harayana',
    zip: '122001',
  },
  shipping_address: {
    address: 'B-1341, Unitech Park ,Sector -39',
    city: 'Gurgaon',
    country: 'IN',
    full_name: 'John Parker',
    phone: '9876545676',
    state: 'Haryana',
    zip: '122001',
  },
  payment_method: {
    settings: {},
  },
  status: 'open',
  financial_status: 'Pending',
  delivery_status: null,
  shipping_status: null,
  cart_id: null,
  discounts: [],
  discount_total: 0,
  shipping_method: {},
  shipping_method_name: null,
  shipping_total: 0,
  currency: {},
  taxes: [],
  taxes_total: 0,
  gift_cards: [],
  gift_card_total: 0,
  ecoupon: {},
  options: {},
  additional_charges: [],
  metafields: {},
  price_type: 'inclusive',
  txn_id: null,
  channel: 'user',
  balance_amount: 0,
  wallets: [],
  client_details: {
    selected_language: 'EN',
  },
  created_on: '2020-05-12T06:59:05.247Z',
  seller: '5bfbd39c0790f66e158b0be7',
  seller_name: 'demo-rohan',
  seller_email: 'rohan.gupta@test.com',
  version: 'ms.0.3.0',
  order_id: 'OID1762',
  notify_customer: 'no',
  fulfillment_status: 'pending',
  notes: [],
  fulfillments: [],
  payment_details: {},
  _created_by: '530d7f8bc6b8283a11000003',
  updated_on: '2020-05-12T07:17:16.316Z',
  _updated_by: '530d7f8bc6b8283a11000003',
}

/** ms-fulfillments "Retrieves a list of fulfillments" example response, first record. */
export const FULFILLMENT = {
  _id: '5d6f5f627ab56e2439cf308e',
  items: [
    {
      _id: '5d6f5f367ab56e2439cf2d85',
      quantity: '1',
      name: 'test01',
      product_id: '5d6f4f0373d72a766a78852c',
      product_url: '/product/test01',
      weight: '600',
      selected_options: {},
      variant_id: null,
      seller: '5d6f4f0273d72a766a788510',
      linked_product_id: null,
      price: '200',
      list_price: 200,
      discounts_percentage: '0.000',
      discounts_total: '0',
      discounts: [],
      override_total: 0,
      overrides: {},
      taxes: [],
      taxes_total: 0,
      shipping_cost: 0,
      sku: 'test01',
      discount_total: '0',
      total: '200',
      total_tax: 0,
      total_with_tax: 200,
      fulfilled_quantity: 0,
    },
  ],
  sub_total: 200,
  total: 200,
  item_count: 1,
  status: 'pending',
  financial_status: 'Pending',
  balance_amount: 200,
  delivery_status: null,
  shipping_status: null,
  fulfillment_status: null,
  cart_id: '5d6f5f2b7ab56e2439cf2c39',
  email: 'mukesh.kumar@hippoinnovations.com',
  user_id: '5d6f5783208cac79176a7091',
  discounts: [
    {
      name: 'adminDiscount',
      saved_amount: 0,
    },
  ],
  discount_total: 0,
  discounts_total: 0,
  shipping_method: {},
  shipping_method_name: null,
  shipping_total: 0,
  shipping_by_vendor: {
    '5d6f4f0273d72a766a788510': 0,
  },
  currency: {
    name: 'INR',
    conversion_rate: '1',
    decimal_points: '1',
    symbol: '₹',
  },
  taxes: [],
  taxes_total: 0,
  gift_cards: [],
  gift_card_total: 0,
  ecoupon: {},
  options: {},
  billing_address: {
    _id: '5d6f579e208cac79176a71e9',
    phone: '+918010117117',
    full_name: 'mukesh',
    address: 'Office No. 239  Building Name-4 Street Name - Spaze',
    city: 'Delhi',
    zip: '110085',
    country: 'IN',
    state: 'Haryana',
    user_id: '5d6f5783208cac79176a7091',
    created_on: '2019-09-04T06:20:14.414Z',
    _created_by: '5d3848415b82914d861ceb94',
  },
  shipping_address: {
    _id: '5d6f579e208cac79176a71e9',
    phone: '+918010117117',
    full_name: 'mukesh',
    address: 'Office No. 239  Building Name-4 Street Name - Spaze',
    city: 'Delhi',
    zip: '110085',
    country: 'IN',
    state: 'Haryana',
    user_id: '5d6f5783208cac79176a7091',
    created_on: '2019-09-04T06:20:14.414Z',
    _created_by: '5d3848415b82914d861ceb94',
  },
  additional_charges: [],
  metafields: {
    Shipping_Status: 'sadasxdc',
  },
  price_type: 'exclusive',
  channel: 'admin',
  payment_method: {
    type: 'cash_on_delivery',
    settings: {},
  },
  payment_details: {
    Type: 'cash_on_delivery',
    name: 'COD',
    status: 'Successful',
    type: 'cash_on_delivery',
    verified: 'Not Needed',
  },
  wallets: [],
  client_details: {
    selected_language: 'EN',
  },
  marketplace_channel: {},
  txn_id: 'TXN-94Y2XP836',
  transaction: [
    {
      amount: 200,
      txn_id: 'TXN-94Y2XP836',
    },
  ],
  created_on: '2019-09-04T06:53:22.970Z',
  seller: '5c11d491c9b06766f1bf76a4',
  seller_name: 'new store',
  seller_email: 'sales@storehippo.com',
  version: 'ms.0.3.0',
  order_id: '5d6f5f367ab56e2439cf2dc4',
  order_approval_required: '1',
  order_approval_for_seller: '1',
  notify_customer: 'no',
  notes: [],
  fulfillments: [],
  additional_charge: 0,
  new_flow: true,
  fid: 'OID5182-F2073',
  oid: 'OID5182',
  shipping_charge: 0,
  discount: 0,
  tax: 0,
  tracking_status: 'shipped',
  shipment_id: '5d6f5f6303813f17e224dde8',
  _created_by: '5d3848141c5aaa4cfd8f4e03',
  tracking_number: '5454185465',
  tracking_company: 'delhivery',
  service: 'manual',
  price: null,
  updated_on: '2019-09-04T06:53:23.267Z',
  _updated_by: '5d3848141c5aaa4cfd8f4e03',
}

/** ms-coupon_codes: field examples; `_id` from the API overview's list example. */
export const COUPON_CODE = {
  _id: '59316a9c1da5cdb0168f2936',
  coupon_code: 'GET 25',
  description: 'Get Rs 25 on order total greater than 500',
  type: 'flat',
  amount: 25,
  enabled: '1',
  advance_settings: '1',
  conditions: [{ field: 'order.total', operator: 'greater_than', value: '500' }],
  number_of_uses: 3,
  uses_per_user: 2,
  start_date: '2018-04-25T06:48:00.000Z',
  end_date: '2018-04-30T06:48:00.000Z',
  seller: '586f990997da96ba5c9ae2ac',
  use_count: '50',
}

/**
 * ms-refunds has no example response. order_id, rma_number and refund_type
 * are the documented field examples; mode, note, transaction_info,
 * amount_refunded and created_on are test values for documented fields.
 */
export const REFUND = {
  _id: '5922883b4bf74dca131e25e7',
  order_id: 'OID-243',
  rma_number: 'RMA2',
  refund_type: 'full',
  mode: 'online',
  note: 'Damaged in transit',
  transaction_info: {
    amount: '399.60',
    currency: 'INR',
    txn_id: 'TXN-94Y2XP836',
  },
  amount_refunded: '399.60',
  created_on: '2019-09-04T06:53:22.970Z',
}

/** ms-store_locations: field examples. */
export const STORE_LOCATION = {
  _id: '58c0e4c8029c76d907da0924',
  title: 'My Fashion Store',
  email: 'dennis.richie@gmail.com',
  phone: '7458721694',
  address: '456, Baker Street',
  country: 'IN',
  country_name: 'India',
  state: 'Haryana',
  city: 'Gurugram',
  zip_code: '122001',
  state_code: 'HR',
  show_on_website: '1',
  longitude: '77.0397968',
  latitude: '28.413605',
}

/**
 * ms-currencies: `name` "It contains the currency code.", `default` [number]
 * "It stores the default currency of the store." The docs show no value for
 * either; 'INR' and 1 are test values.
 */
export const DEFAULT_CURRENCY = { _id: '5d4d57acb6455f39d99da5f8', name: 'INR', default: 1 }
