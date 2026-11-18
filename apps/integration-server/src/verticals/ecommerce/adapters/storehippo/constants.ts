/**
 * StoreHippo REST API constants.
 *
 * The API overview (https://help.storehippo.com/api, "How to call") calls
 *   "https://{storename}.storehippo.com/api/1.1/entity/ms.products"
 * with the key in the `access-key` header ("Authenticate your API requests by
 * passing your access key in the access-key header of your HTTP request.").
 */

/** The version segment of the documented base path: `/api/1.1/entity/<entity>`. */
export const API_VERSION = '1.1'

/**
 * The documented default page size. "Pagination": `limit` "Default Value : 50",
 * "A limit on the number of records to be returned." No maximum is documented.
 * Used as the fixed upstream page size where rows are flattened out of
 * product pages.
 */
export const DOCUMENTED_DEFAULT_LIMIT = 50

/**
 * Entity names used in the URL path. Each read entity below has a reference
 * page under https://help.storehippo.com/api/reference/<alias> with a
 * documented `list` (GET /api/1/entity/<entity>) and `get`
 * (GET /api/1/entity/<entity>/{resource_id}) command.
 */
export const ENTITY = {
  PRODUCT: 'ms.products',
  CATEGORY: 'ms.categories',
  CUSTOMER: 'ms.users',
  ORDER: 'ms.orders',
  /** "Coupon Codes": "It allows you to offer coupon codes to your customers". */
  COUPON_CODE: 'ms.coupon_codes',
  /** "Fulfillments": list/get documented on the ms-fulfillments reference. */
  FULFILLMENT: 'ms.fulfillments',
  REFUND: 'ms.refunds',
  /** "Store Locations are the physical locations from where you are operating your business." */
  STORE_LOCATION: 'ms.store_locations',
  /** "Currencies": carries `default` ("It stores the default currency of the store."). */
  CURRENCY: 'ms.currencies',
} as const

/**
 * Entity names the WRITE methods still post to. They were out of scope of
 * the list rebuild and neither has a page in the current API reference
 * (which documents ms.coupon_codes and ms.fulfillments). ms.coupons is not
 * documented at all; ms.shipments is documented only in the legacy API feed
 * (https://help.storehippo.com/api/1.1/entity/ms.apis, "Shipments": add,
 * list, update, delete, track, cancel).
 */
export const UNVERIFIED_WRITE_ENTITY = {
  COUPON: 'ms.coupons',
  SHIPMENT: 'ms.shipments',
} as const
