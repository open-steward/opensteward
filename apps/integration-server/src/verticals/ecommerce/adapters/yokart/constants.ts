/**
 * Yo!Kart REST API constants.
 *
 * Yo!Kart is a self-hosted multi-vendor marketplace platform. The REST API
 * (referred to as the "App API") is versioned in the path:
 *
 *   https://{store-domain}/app-api/{version}/
 *
 * v2.0 is the current stable release (publicly available on the official
 * demo at demo.yo-kart.com). v2.3 is the version documented in the
 * official API Document PDF.  We pin 2.0 here because it is what the live
 * public endpoints serve; bump this when the adapter is re-tested against
 * a newer deployment.
 *
 * Docs: https://www.yo-kart.com/resource-center.html (API Document V2.3)
 */
export const API_VERSION = '2.0'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
