import type { LogisticsAdapter, Credentials } from '../../adapter/interface'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
} from './auth'

/**
 * DeliverectAdapter — logistics adapter for the Deliverect platform.
 *
 * Deliverect is an INBOUND PUSH platform: orders, status updates, and courier
 * events are delivered to the integration server via webhooks. Deliverect does
 * not expose outbound REST endpoints for listing or fetching orders, shipments,
 * tracking events, or rates — all such data arrives as push payloads.
 *
 * Auth: OAuth 2.0 Client Credentials (machine-to-machine), used when
 * Deliverect needs to verify the receiver's identity or when calling the
 * limited Dispatch management endpoints that are part of the partner programme.
 * Credentials shape: { clientId, clientSecret, accountId? } in extra.
 *
 * No list/get/create/update/delete operations are implemented here because
 * none of those REST endpoints exist on the Deliverect platform as documented.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Deliverect is an inbound push platform for food-delivery aggregation and does not expose carrier management endpoints.
// Unavailable: label    — Deliverect does not issue or manage shipping labels; it is not a parcel-shipping platform.
// Unavailable: manifest — Deliverect does not produce carrier manifests; no such endpoint exists in the documented API.
// Unavailable: warehouse — Deliverect represents locations as channel-linked POS sites; no outbound REST endpoint for warehouse resources is documented.
export class DeliverectAdapter implements LogisticsAdapter {
  readonly platform = 'deliverect'
  readonly version = '1'

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }
}
