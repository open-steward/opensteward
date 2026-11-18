/**
 * Central Transport LTL carrier — Piyovi unified API.
 *
 * Central Transport integrates via the Piyovi carrier platform, which provides
 * a unified REST API layer over the carrier's native systems.
 *
 * Auth: X-API-KEY header (API key obtained from Piyovi dashboard under
 *       App → Configuration → API KEY).
 * Docs: https://docs.piyovi.io/carriers/integrated/central-transport
 */

export const CENTRAL_TRANSPORT_API_BASE = 'https://api.piyovi.io/v1'

/** Piyovi OAuth token endpoint (client-credentials, current preferred method). */
export const CENTRAL_TRANSPORT_TOKEN_URL = 'https://account.piyovi.io/connect/token'

/** Piyovi dashboard URL — used as the auth redirect for API-key adapters. */
export const CENTRAL_TRANSPORT_DASHBOARD_URL =
  'https://app.piyovi.io/configuration/api-key'

export const RATE_LIMIT_RPM = 100

export const TRACKING_STATUS_MAP: Record<string, string> = {
  'Picked Up': 'PRE_TRANSIT',
  'In Transit': 'IN_TRANSIT',
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  Exception: 'FAILURE',
  'Appointment Set': 'IN_TRANSIT',
  Delayed: 'IN_TRANSIT',
  'On Hold': 'IN_TRANSIT',
  Cancelled: 'FAILURE',
}
