/**
 * Skio StorefrontUser → canonical Customer.
 *
 * Skio calls customers "StorefrontUsers". GET /storefront-users returns them
 * under `data`. The documented row carries `id`, `platformId`, `firstName`,
 * `lastName`, `email`, `phoneNumber`, `createdAt`, `updatedAt` and four
 * subscription arrays (`activeSubscriptions`, `cancelledSubscriptions`,
 * `pausedSubscriptions`, `failedSubscriptions`). No address is documented, so
 * none is mapped; the subscriptions stay in `metadata`.
 *
 * Docs: https://code.skio.com/rest-api/
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Skio shape (GET /storefront-users `data[]`) ──────────────────────────

export interface RawSkioStorefrontUser {
  id: string
  platformId?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phoneNumber?: string | null
  createdAt: string
  updatedAt: string
  activeSubscriptions?: unknown[]
  cancelledSubscriptions?: unknown[]
  pausedSubscriptions?: unknown[]
  failedSubscriptions?: unknown[]
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformStorefrontUser(raw: RawSkioStorefrontUser): Customer {
  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phoneNumber ?? undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
