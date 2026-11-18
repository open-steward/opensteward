/**
 * Russian Post (Pochta Rossii) — API constants
 *
 * Otpravka (shipment management) base URL.
 * Auth is two-header basic: AccessToken (app token) + X-User-Authorization (base64 login:password).
 */
export const POCHTA_RUSSIA_API_BASE = 'https://otpravka.pochta.ru/1.0'

/**
 * Tariff calculation endpoint — open API, no auth required.
 */
export const POCHTA_RUSSIA_TARIFF_BASE = 'https://tariff.pochta.ru/tariff/v1'

/**
 * Tracking SOAP endpoint.
 */
export const POCHTA_RUSSIA_TRACKING_URL = 'https://tracking.pochta.ru/tracking/rest'

/** Dashboard / sign-up URL shown during Connect Link flow. */
export const POCHTA_RUSSIA_DASHBOARD_URL = 'https://otpravka.pochta.ru'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
