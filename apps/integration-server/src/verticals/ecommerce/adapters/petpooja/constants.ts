/**
 * Petpooja Online Ordering API constants.
 *
 * Petpooja is a restaurant POS and management platform. The Online Ordering
 * API (V2.1.0) is the partner-facing REST API used by third-party platforms to
 * sync menus (categories + items) and push orders into the Petpooja POS.
 *
 * Auth credentials — obtained from support@petpooja.com:
 *   appKey, accessToken, restaurantId, appSecretKey
 *
 * All are sent as POST body fields (or query params on GET requests).
 *
 * Docs: https://onlineorderingapisv210.docs.apiary.io/
 */

export const BASE_URL = 'https://pos.petpooja.com/api/v2'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
