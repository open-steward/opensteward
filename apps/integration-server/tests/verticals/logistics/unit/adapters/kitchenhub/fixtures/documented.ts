/**
 * KitchenHub response fixtures built from the first-party docs.
 *
 *  - documentedOrder: the "Order Example" of the Orders API guide
 *    (https://kitchenhub.readme.io/reference/orders-api.md), verbatim apart
 *    from two of its four items, whose shape the other two already cover.
 *    Its fields match ms_api__core_models__OrderModel in
 *    https://kitchenhub.readme.io/reference/get_v2-orders-1.md.
 *  - documentedDelivery: the "Response 201" example of the Deliveries API
 *    guide (https://kitchenhub.readme.io/reference/deliveries-api.md), whose
 *    `delivery_id` is the id DeliveryResponseSerializer requires
 *    (https://kitchenhub.readme.io/reference/get_v2-deliveries.md).
 *  - documentedProvider: ProviderGeneralInfoSerializer's required fields
 *    (https://kitchenhub.readme.io/reference/get_v2-providers-1.md), valued
 *    from the "Provider Capabilities" table of the Providers & Integrations
 *    guide (https://kitchenhub.readme.io/reference/providers-api.md).
 *  - documentedStore: StoreRetrieveResponseSerializer's fields
 *    (https://kitchenhub.readme.io/reference/get_v2-stores.md). The OpenAPI
 *    gives no example values; ids and name are the Locations & Stores guide's
 *    example values (store_001, loc_001, partner_store_001, Main Brand); the
 *    address is the Deliveries guide example's pickup `store_address`
 *    ("19 North Park Avenue, Rockville Centre, NY 11570") split into the
 *    schema's street, city, state and zipcode. `country` and `created_at`
 *    are required by the serializer but have no documented store example:
 *    'US' and the timestamp (borrowed from the Deliveries guide) are
 *    placeholders. The transform does not read country, and created_at only
 *    needs to be a documented ISO timestamp string.
 */
import type { KitchenHubOrder } from '../../../../../../../src/verticals/logistics/adapters/kitchenhub/transform/order'
import type { KitchenHubDelivery } from '../../../../../../../src/verticals/logistics/adapters/kitchenhub/transform/shipment'
import type { KitchenHubProvider } from '../../../../../../../src/verticals/logistics/adapters/kitchenhub/transform/carrier'
import type { KitchenHubStore } from '../../../../../../../src/verticals/logistics/adapters/kitchenhub/transform/warehouse'

export function documentedOrder(): KitchenHubOrder {
  return {
    order: {
      id: 5501505922269184,
      external_id: '4ae18552-60a8-11ee-8553-abf2eec4f777',
      number: '201523913381757',
      daily_number: 15,
      type: 'delivery',
      status: 'completed',
      notes: "Contactless delivery, Please don't ring the doorbell.",
      paid: true,
      asap: false,
      add_disposable_items: true,
      prep_time_minutes: null,
      data: {},
    },
    provider: {
      id: 'grubhub',
      name: 'GrubHub',
      merchant_id: '2626147',
      store_id: 'c212a250-3b69-45ab-9184-03fb2072x7xx',
    },
    store: {
      id: 'c212a250-3b69-45ab-9184-03fb2072x7xx',
      name: 'The Spot Asian Food Hall',
      partner_store_id: null,
    },
    customer: {
      name: 'Ari S',
      email: null,
      phone_number: '3012136310',
      phone_code: null,
    },
    items: [
      {
        id: '6035887902',
        name: '2 Proteins',
        quantity: 1,
        price: '22.25',
        original_price: '22.25',
        instructions: null,
        options: [
          {
            id: '6035887894',
            name: 'Sushi Rice',
            quantity: 1,
            price: '0.0',
            original_price: '0.0',
            modifier_name: null,
          },
        ],
      },
      {
        id: '6027293408',
        name: 'Magic Roll',
        quantity: 1,
        price: '13.45',
        original_price: '13.45',
        instructions: null,
        options: [],
      },
    ],
    delivery: {
      type: 'provider',
      address: {
        country: 'US',
        street: '1234 Bettstrail Way',
        city: 'Rockville',
        state: 'MD',
        zipcode: '20854',
        unit_number: null,
        latitude: 39.07294,
        longitude: -77.17325,
      },
      courier: {
        name: 'Donald V',
        photo_url: 'https://s3.amazonaws.com/d5eb54503152.png',
        phone_number: '2407930399',
        status: 'assigned',
      },
      status: null,
      notes: null,
    },
    payment: { method: 'CREDIT CARD' },
    charges: {
      discount: '0.0',
      commission: null,
      processing_fee: null,
      adjustment: null,
      tax_payout: '0.0',
      restaurant_tip_amount: '0.0',
      delivery_fee: null,
      subtotal: '66.84',
      total: '72.44',
      tips: '0.0',
      service_fee: null,
      tax: '5.6',
      payout: null,
      other_fee: {},
    },
    timestamps: {
      placed_at: '2023-10-01T22:20:26Z',
      created_at: '2023-10-01T22:21:44Z',
      pickup_at: '2023-10-01T23:45:00Z',
      accepted_at: '2023-10-01T23:14:44Z',
      cancelled_at: null,
      cancelled_by: null,
      completed_at: '2023-10-01T23:30:45Z',
      delivery_at: '2023-10-01T23:45:00Z',
      scheduled_for: '2023-10-01T23:45:00Z',
    },
  }
}

export function documentedDelivery(): KitchenHubDelivery {
  return {
    delivery_id: '550e8400-e29b-41d4-a716-446655440000',
    order_id: 'order-123',
    store_id: 'your-store-id',
    status: 'new',
    delivery_provider_id: 'doordash_drive',
    delivery_order_id: 'dsd-abc123',
    tracking_url: 'https://doordash.com/track/abc123',
    scheduled_order: false,
    pickup_info: {
      store_name: 'My Burger',
      store_address: '456 Restaurant Ave, New York, NY',
      pickup_datetime: '2025-05-05T14:00:00.000000Z',
      estimated_pickup_at: '2025-05-05T14:10:00.000000Z',
    },
    drop_off_info: {
      drop_off_address: '123 Main St, New York, NY 10001',
      drop_off_notes: 'Leave at door',
      estimated_dropoff_at: '2025-05-05T14:35:00.000000Z',
    },
    customer_info: {
      first_name: 'Jane',
      last_name: 'Doe',
      phone_number: '+12025550100',
      email: 'jane@example.com',
    },
    charges: { total: '45.00', subtotal: '36.01', delivery_fee: '5.99', delivery_tips: '3.00' },
    courier_info: null,
    created_at: '2025-05-05T13:55:00.000000Z',
    accepted_at: null,
    delivery_at: null,
    canceled_at: null,
    cancellation_reason: null,
    is_mock_delivery: false,
  }
}

export function documentedProvider(): KitchenHubProvider {
  return { provider_id: 'doordash', provider_name: 'Doordash' }
}

export function documentedStore(): KitchenHubStore {
  return {
    id: 'store_001',
    partner_store_id: 'partner_store_001',
    store_name: 'Main Brand',
    location_id: 'loc_001',
    street: '19 North Park Avenue',
    city: 'Rockville Centre',
    state: 'NY',
    zipcode: '11570',
    country: 'US',
    created_at: '2024-10-09T07:44:21.885334Z',
  }
}
