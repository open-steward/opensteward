/**
 * Squarespace API constants.
 *
 * Every Squarespace resource is versioned on its own path under one host
 * (https://developers.squarespace.com/commerce-apis/versioning): orders,
 * inventory and transactions under `/1.0/commerce`, profiles under
 * `/1.0/profiles`, and the current Products API under `/v2/commerce/products`
 * ("Current version: v2 | Legacy versions: v1.1, v1.0"). Auth is an API key
 * or OAuth token in `Authorization: Bearer <token>`, plus a User-Agent.
 *
 * Docs: https://developers.squarespace.com/commerce-apis/overview
 */
export const BASE_URL = 'https://api.squarespace.com'

/** Orders, inventory and transactions (and the legacy v1.0 product writes). */
export const COMMERCE_V1 = '/1.0/commerce'

/** Products API v2: GET /v2/commerce/products and /v2/commerce/products/{productIdCsvs}. */
export const PRODUCTS_V2 = '/v2/commerce/products'

/** Profiles API: GET /1.0/profiles and /1.0/profiles/{profileIdCsvs}. */
export const PROFILES = '/1.0/profiles'
