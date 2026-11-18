/**
 * Ko-fi API constants.
 *
 * Ko-fi is a creator tip jar and digital products platform. Creators receive
 * one-time tips ("coffees"), monthly memberships, and sell digital products /
 * commissions via Ko-fi Shop.
 *
 * Auth: Static verification token. No OAuth2, no token expiry.
 *  - `accessToken` = Ko-fi verification token (used to verify webhook payloads)
 *  - `extra.pageId` = Ko-fi page identifier (e.g. "yourusername")
 *
 * API surface: Primarily webhook-based. Ko-fi POSTs transaction events to a
 * registered callback URL. There is no general REST API for querying historical
 * orders or customers — the adapter is therefore webhook-first.
 *
 * Slug: `kofi` (both directory and platform identifier).
 */

/** Ko-fi webhook transaction types as sent in the `type` field. */
export const KOFI_TYPE_DONATION = 'Donation'
export const KOFI_TYPE_SUBSCRIPTION = 'Subscription'
export const KOFI_TYPE_SHOP_ORDER = 'Shop Order'
export const KOFI_TYPE_COMMISSION = 'Commission'

/** Default currency when Ko-fi payload omits the field. */
export const DEFAULT_CURRENCY = 'USD'
