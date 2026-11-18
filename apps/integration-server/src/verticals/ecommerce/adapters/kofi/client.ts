/**
 * Ko-fi "client".
 *
 * Ko-fi does not expose a general REST API for querying resources — the
 * platform is almost entirely webhook-driven. This module exists as a
 * placeholder so the adapter follows the same structural conventions as other
 * adapters in the vertical.
 *
 * If Ko-fi ever ships a public REST API the HTTP logic can be added here
 * without touching the adapter entry point or transform layer.
 */

import type { Credentials } from '@opensteward/shared'

/**
 * KofiClient is a no-op client that carries credentials for the adapter.
 * Because Ko-fi provides no queryable REST endpoints for listings, all
 * meaningful data flows in through webhooks rather than out through API calls.
 */
export class KofiClient {
  readonly pageId: string | undefined

  constructor(credentials: Credentials) {
    this.pageId = credentials.extra?.['pageId'] as string | undefined
  }
}
