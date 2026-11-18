/**
 * Accounting's list-router helpers.
 *
 * The implementation now lives in `@opensteward/shared` (`router/list-envelope`)
 * and is shared by all nine verticals. It was accounting-only for a long time,
 * which is precisely why accounting was the only vertical that parsed a query
 * parameter, honoured `limit`, or returned a `meta` block — while every
 * vertical's OpenAPI promised all three.
 *
 * These re-exports keep the local names the routers already use, so the
 * vertical reads the same as before while there is only one implementation to
 * keep correct.
 */
export {
  parseListQuery,
  listPage,
  collectionIsComplete,
  DEFAULT_PAGE_LIMIT,
} from '@opensteward/shared'

import { readUpstreamPage, callerLimit } from '@opensteward/shared'
import type { QueryParams } from '../adapter/interface'

/**
 * Pagination for the response envelope: what the caller asked for, plus
 * whatever the platform reported.
 *
 * Retained for the tests and callers that want the numbers without building a
 * whole envelope; `listPage` is the path every router takes.
 */
export function listPageMeta(params: QueryParams): {
  totalCount?: number
  page?: number
  limit?: number
} {
  const upstream = readUpstreamPage(params)
  return {
    totalCount: upstream?.totalCount,
    page: params.page ?? 1,
    // The caller's page size. The router no longer over-fetches, so this is
    // `params.limit`, defaulted for params that were built without one.
    limit: callerLimit(params),
  }
}
