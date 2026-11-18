/**
 * Deck Commerce OMS API constants.
 *
 * Base URL is per-tenant: the site's "Web API Url" (vendor Magento module
 * setting); API names such as api/PimInventoryLookup are appended to it.
 *
 * Auth: HMAC-SHA256 token computed as:
 *   sha256(lowercase(apiName) + timestampUTC + siteApiKey) — uppercase hex
 * Sent as the Authorization header. Also requires apiVersion: 5 header.
 * Each request body includes VerificationKey, TimestampUTC, and SiteCode.
 */

/** Default API version sent in the apiVersion header */
export const API_VERSION = '5'
