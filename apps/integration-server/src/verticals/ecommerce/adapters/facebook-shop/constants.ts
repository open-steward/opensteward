/**
 * Facebook Shop / Meta Commerce Platform API constants.
 *
 * Facebook Shop uses the Graph API for catalog (products) and Commerce
 * API for orders/fulfillments. Auth is OAuth2 via Facebook Login.
 *
 * Base URL: https://graph.facebook.com/v25.0/
 */

/**
 * Graph API base URL. v25.0 was released February 18, 2026 and expires July
 * 29, 2028 (https://developers.facebook.com/docs/graph-api/changelog/versions);
 * v19.0, used before, expired May 21, 2026. The Order API samples use v25.0.
 */
export const GRAPH_API_BASE = 'https://graph.facebook.com/v25.0'

/** Facebook OAuth2 endpoints. */
export const OAUTH_AUTHORIZE_URL = 'https://www.facebook.com/v25.0/dialog/oauth'
export const OAUTH_TOKEN_URL = 'https://graph.facebook.com/v25.0/oauth/access_token'

/** Access tokens are long-lived (~60 days). Refresh 1 day early. */
export const TOKEN_BUFFER_MS = 24 * 60 * 60 * 1000

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 25

/** OAuth2 scopes for Commerce Platform access. */
export const DEFAULT_SCOPES = [
  'catalog_management',
  'commerce_manage_orders',
  'pages_read_engagement',
]

/** Graph API product fields to request. */
export const PRODUCT_FIELDS = [
  'id',
  'name',
  'description',
  'price',
  'currency',
  'image_url',
  'additional_image_urls',
  'url',
  'brand',
  'category',
  'availability',
  'condition',
  'retailer_id',
  'retailer_product_group_id',
  'review_status',
  'sale_price',
  'inventory',
].join(',')

/**
 * ProductSet fields to request. ProductSet has no `description` or
 * `filter_spec`; Meta's Business SDK (productset.py `_field_types`) lists
 * `filter`, `id`, `name`, `product_count` and `retailer_id` among its fields.
 */
export const PRODUCT_SET_FIELDS = ['id', 'name', 'filter', 'product_count', 'retailer_id'].join(',')

/**
 * Order line-item fields, requested through Graph API field expansion
 * (`<LEVEL_ONE>{<LEVEL_TWO>}`). `product_name` "is not a default field and
 * must be explicitly asked for via a `fields=` query."
 */
export const ORDER_ITEM_FIELDS = [
  'id',
  'product_id',
  'retailer_id',
  'product_name',
  'quantity',
  'price_per_unit',
].join(',')

/**
 * Every documented `order_state`. The list edge "returns orders in `CREATED`
 * state unless state parameter is specified", and `state` is a "Comma-separated
 * list of order states to filter on. When you specify two or more states
 * behavior is OR." — so listing every order means naming every state.
 */
export const ORDER_STATES = ['FB_PROCESSING', 'CREATED', 'IN_PROGRESS', 'COMPLETED'].join(',')

/** Graph API order fields to request (all documented on the `order` object). */
export const ORDER_FIELDS = [
  'id',
  'order_status',
  'created',
  'last_updated',
  `items{${ORDER_ITEM_FIELDS}}`,
  'ship_by_date',
  'merchant_order_id',
  'channel',
  'selected_shipping_option',
  'shipping_address',
  'estimated_payment_details',
  'buyer_details',
].join(',')
