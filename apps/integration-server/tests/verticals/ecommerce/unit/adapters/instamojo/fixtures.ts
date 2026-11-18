import type {
  RawInstamojoPaymentDetail,
  RawInstamojoRefundCase,
} from '../../../../../../src/verticals/ecommerce/adapters/instamojo/transform/refund-case'

/**
 * The example 200 response of "Get details of a refund",
 * GET /v2/resolutioncenter/cases/{id}/
 * (https://docs.instamojo.com/reference/get-details-of-a-refund-1), verbatim.
 */
export function documentedRefundCase(): RawInstamojoRefundCase {
  return {
    id: 'C5c0751272',
    created_by: null,
    payment: 'https://api.instamojo.com/v2/payments/MOJO5a06005J21512197/',
    status: 'FINI',
    resolution_status: 'FINI_CONC',
    status_text: 'Refunded',
    type: 'QFL',
    body: "Customer isn't satisfied with the quality",
    refund_amount: '2500.00',
    references: [
      {
        id: 'MOJO0a22U05M99838558',
        type: 'Payment held.',
        created_at: '2020-10-22T11:57:21.477161Z',
      },
      {
        id: 'MOJO0a22Q05M99854564',
        type: 'Held payment reversed.',
        created_at: '2020-10-22T17:07:58.171682Z',
      },
      {
        id: 'MOJO0a22W05M99854566',
        type: 'Payment settled.',
        created_at: '2020-10-22T17:07:58.229600Z',
      },
    ],
    refunds: [
      {
        id: '7ad3f73f-2a6c-4326-95e6-38381db7e969',
        status: 'Completed',
        bank_reference_number: 'IGAJRIYGL4',
        created_at: '2020-10-22T17:07:58.272904Z',
      },
    ],
    transaction_id: '1603367841023',
    created_at: '2020-10-22T11:57:21.410686Z',
    updated_at: '2020-10-22T17:07:58.322985Z',
    resource_uri: 'https://api.instamojo.com/v2/resolutioncenter/cases/C0a2233225/',
    creator_name: 'Sample seller',
  }
}

/**
 * The first example 200 response of "Get Payment Details",
 * GET /v2/payments/{id}/
 * (https://docs.instamojo.com/reference/get-payment-details-1), verbatim.
 */
export function documentedPaymentDetail(): RawInstamojoPaymentDetail {
  return {
    id: 'MOJO3207U05Q80983266',
    title: 'FIFA 10',
    payment_type: 'api_rap',
    payment_request:
      'https://api.instamojo.com/v2/payment_requests/b318750f06e3491484acef4cb4ff7966/',
    status: true,
    link: null,
    product: null,
    seller: 'https://api.instamojo.com/v2/users/60d40901b01044c8a3eaaa4d40fb04d2/',
    currency: 'INR',
    amount: '10.00',
    name: 'Rahul',
    email: 'rahul.sharma@instamojo.com',
    phone: '+919898989898',
    payout: null,
    fees: '3.20',
    total_taxes: '0.58',
    cases: [],
    affiliate_id: null,
    affiliate_commission: '0.00',
    order_info: {
      shipping_address: null,
      shipping_city: null,
      shipping_state: null,
      shipping_zip: null,
      shipping_country: null,
      quantity: 1,
      unit_price: '10.00',
      custom_fields: {},
      variants: [],
    },
    instrument_type: 'QR',
    billing_instrument: 'Order based QR Code',
    failure: null,
    created_at: '2023-02-07T08:30:33.902672Z',
    updated_at: '2023-02-07T08:30:34.300356Z',
    tax_invoice_id: '',
    resource_uri: 'https://api.instamojo.com/v2/payments/MOJO3207U05Q80983266/',
  }
}
