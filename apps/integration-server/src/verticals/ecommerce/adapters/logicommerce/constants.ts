/**
 * Shopify Admin REST API constants, used only by ./client.ts, the Shopify-era
 * client behind the write methods (out of scope for the API Sync read rebuild).
 *
 * The Shopify Admin REST API is versioned quarterly. We pin a known-good
 * version here so adapter behaviour is deterministic — bump this when the
 * adapter is re-tested against a newer version.
 */
export const API_VERSION = '2025-01'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250
