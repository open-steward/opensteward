/**
 * ecommerce token refresher.
 *
 * The implementation is shared — see `@opensteward/shared`'s TokenRefresher,
 * which records every refresh outcome so `last_refresh_at` /
 * `last_refresh_status` reflect sync-path refreshes as well as the daily
 * keep-alive worker.
 *
 * A thin alias so the import path and the per-vertical adapter typing
 * stay put.
 */
import { TokenRefresher as SharedTokenRefresher } from '@opensteward/shared'
import type { EcommerceAdapter } from '../adapter/interface'

export class TokenRefresher extends SharedTokenRefresher<EcommerceAdapter> {}
