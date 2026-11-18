/**
 * WooCommerce REST API constants.
 *
 * The WooCommerce REST API is namespaced under `/wp-json/wc/{version}` on
 * the host WordPress site. v3 is the current stable API and has been
 * supported since WC 3.5; bump this when the adapter is re-tested against
 * a newer version.
 */
export const API_VERSION = 'v3'

export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100
