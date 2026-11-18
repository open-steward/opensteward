/**
 * Faire fixtures built from the DOCUMENTED examples: the "Get all Products" and
 * "Get all Orders" sample responses in the first-party legacy docs
 * (faire.github.io/external-api-v2-docs, archived 2025-01-14), whose endpoints
 * are the current spec's GET /products and GET /orders, plus the `example`
 * values of the spec's ExternalProductVariantV2 / ExternalOrderV2 /
 * ExternalMoneyV2 / ExternalImageV2 / ExternalPayoutCostsV2 properties
 * (https://cdn.faire.com/static/js/784.fd6421f2.chunk.js).
 */
import type {
  RawFaireProduct,
  RawFaireVariant,
} from '../../../../../../src/verticals/ecommerce/adapters/faire/transform/product'
import type { RawFaireOrder } from '../../../../../../src/verticals/ecommerce/adapters/faire/transform/order'

/** The docs' sample variant, verbatim. */
export function docVariant(overrides: Partial<RawFaireVariant> = {}): RawFaireVariant {
  return {
    id: 'po_123',
    idempotence_token: 'rrc23negw',
    name: 'Vanilla Scent',
    sku: 'vanilla-2019',
    images: [{ url: 'https://cdn.faire.com/374cd3041a4c4.png' }],
    options: [{ name: 'Scent', value: 'Vanilla' }],
    wholesale_price_cents: 299,
    retail_price_cents: 599,
    ...overrides,
  }
}

/** The docs' sample product, verbatim. */
export function docProduct(overrides: Partial<RawFaireProduct> = {}): RawFaireProduct {
  return {
    id: 'p_123',
    idempotence_token: '4aytry2ust',
    brand_id: 'b_abc',
    short_description: 'Our candles smell fantastic. Want to know how good? Read our description!',
    description:
      'Glad you decided to read our description! We have significantly more characters to describe to you just how good our candles smell.',
    wholesale_price_cents: 500,
    retail_price_cents: 1000,
    sale_state: 'NOT_FOR_SALE',
    lifecycle_state: 'DRAFT',
    name: "Faire's fantastic candle",
    unit_multiplier: 2,
    minimum_order_quantity: 8,
    per_style_minimum_order_quantity: 0,
    variant_option_sets: [{ name: 'Scent', values: ['Cinnamon', 'Skunk', 'Vanilla'] }],
    taxonomy_type: { id: 'tt_23nl3bzl00', name: 'Votive Candle' },
    variants: [docVariant()],
    created_at: '2019-03-14T00:09:15.000Z',
    updated_at: '2019-03-15T00:09:15.000Z',
    ...overrides,
  }
}

/** The docs' sample order, verbatim. */
export function docOrder(overrides: Partial<RawFaireOrder> = {}): RawFaireOrder {
  return {
    id: 'bo_bxdmjbwxid',
    created_at: '2019-03-15T00:09:15.000Z',
    updated_at: '2019-03-15T00:10:00.000Z',
    state: 'NEW',
    items: [
      {
        id: 'oi_bq425ju5vh',
        created_at: '2019-03-15T00:09:15.000Z',
        updated_at: '2019-03-15T00:09:15.000Z',
        order_id: 'bo_bxdmjbwxid',
        product_id: 'p_fccaefnahr',
        variant_id: 'po_3745tjzrpc',
        quantity: 1,
        sku: 'goldenretriever',
        price_cents: 10000,
        product_name: 'Golden Dog',
        variant_name: 'retriever',
        includes_tester: false,
      },
    ],
    address: {
      name: 'John Smith',
      address1: '41 King Street West',
      address2: '3rd Floor',
      postal_code: 'N2G 1A1',
      city: 'Kitchener',
      state: 'Ontario',
      state_code: 'ON',
      phone_number: '555-123-4567',
      country: 'Canada',
      country_code: 'CAN',
      company_name: 'Faire Wholesale, Inc',
    },
    retailer_id: 'r_c9385ldj',
    payout_costs: {
      payout_fee_cents: 0,
      payout_fee_bps: 0,
      commission_cents: 2625,
      commission_bps: 2500,
    },
    source: 'MARKETPLACE',
    ...overrides,
  }
}
