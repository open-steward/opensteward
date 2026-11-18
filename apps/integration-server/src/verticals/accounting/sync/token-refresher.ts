/**
 * accounting token refresher.
 *
 * Thin alias over `@opensteward/shared`'s TokenRefresher, which records
 * every refresh outcome to `last_refresh_at` / `last_refresh_status`. The
 * alias keeps the per-vertical import path and adapter typing.
 */
import { TokenRefresher as SharedTokenRefresher } from '@opensteward/shared'
import type { AccountingAdapter } from '../adapter/interface'

export class TokenRefresher extends SharedTokenRefresher<AccountingAdapter> {}
