import {
  pageByCursor,
  cursorPagerKey,
  _resetCursorPager as resetSharedPager,
  type PagedResult,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import type { HubSpotClient } from './client'

/**
 * Translate the worker's 1-based `page` into HubSpot's `after` cursor.
 *
 * HubSpot's CRM v3 object API has no offset. The only way to reach page N is
 * to walk pages 1..N-1 and carry each response's `paging.next.after`. Left
 * unhandled, `page` was dropped and every request returned the FIRST page.
 *
 * The walk, its memoisation and its time-to-live now live in the shared
 * cursor pager (`@opensteward/shared`, adapter/cursor-pager.ts), which Shopify
 * uses too. What stays here is HubSpot's half: which cursor to send and how to
 * key a portal.
 */

/** Exported for tests — clears the shared pager's module-level cache. */
export function _resetCursorPager(): void {
  resetSharedPager()
}

function scopeFor(credentials: Credentials): string {
  // `portalId` (the HubSpot account) is stable across token refresh; the
  // access token is not, and keying on it would miss the cache hourly.
  const portal =
    (credentials as { portalId?: string | number }).portalId ??
    (credentials as { hubId?: string | number }).hubId ??
    (credentials as { accessToken?: string }).accessToken ??
    'unknown'
  return `hubspot:${String(portal)}`
}

/** One page plus whether HubSpot reported a next cursor after it. */
export async function listPageWithMore<T>(
  client: HubSpotClient,
  credentials: Credentials,
  path: string,
  page: number,
  params: Record<string, unknown>,
): Promise<PagedResult<T>> {
  return pageByCursor<T, string>(cursorPagerKey(scopeFor(credentials), path, params), page, async (after) => {
    const res = await client.list<T>(path, {
      ...params,
      ...(after != null ? { after } : {}),
    })
    return { items: res.items, next: res.nextCursor }
  })
}

/** One page, items only. */
export async function listPage<T>(
  client: HubSpotClient,
  credentials: Credentials,
  path: string,
  page: number,
  params: Record<string, unknown>,
): Promise<T[]> {
  return (await listPageWithMore<T>(client, credentials, path, page, params)).items
}
