/**
 * customer-support token refresher.
 *
 * The implementation is shared — see `@opensteward/shared`'s TokenRefresher.
 * This file is a thin alias so the import path and the per-vertical adapter
 * typing stay put.
 */
import { TokenRefresher as SharedTokenRefresher } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../adapter/interface'

export class TokenRefresher extends SharedTokenRefresher<CustomerSupportAdapter> {}
