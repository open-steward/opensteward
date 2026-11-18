export const BORZO_API_BASE = 'https://robot-in.borzodelivery.com/api/business/1.8'

export const BORZO_DASHBOARD_URL = 'https://borzodelivery.com/in/business'

/**
 * Vehicle type IDs as defined by the Borzo API.
 * Default: 8 = Motorbike (up to 20 kg)
 */
export const VEHICLE_TYPE_MOTORBIKE = 8

export const RATE_LIMIT_RPS = 10
export const DEFAULT_PAGE_SIZE = 20

/**
 * GET /orders `count` ceiling, from https://borzodelivery.com/in/business-api/doc
 * ("List of orders"): "Maximum number of orders to be returned. Cannot be
 * higher than 50."
 */
export const MAX_PAGE_SIZE = 50
