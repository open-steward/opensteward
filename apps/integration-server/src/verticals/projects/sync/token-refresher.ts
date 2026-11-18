/**
 * projects token refresher.
 *
 * The implementation is shared — see `@opensteward/shared`'s TokenRefresher,
 * which records every refresh outcome so `last_refresh_at` /
 * `last_refresh_status` reflect the sync path as well as the keep-alive
 * worker.
 *
 * A thin alias so the import path and the per-vertical adapter typing
 * stay put.
 */
import { TokenRefresher as SharedTokenRefresher } from '@opensteward/shared'
import type { ProjectsAdapter } from '../adapter/interface'

export class TokenRefresher extends SharedTokenRefresher<ProjectsAdapter> {}
