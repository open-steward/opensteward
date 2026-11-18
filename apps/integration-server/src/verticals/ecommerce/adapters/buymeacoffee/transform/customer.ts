/**
 * Buy Me a Coffee Supporter / Subscription → canonical Customer.
 *
 * Buy Me a Coffee has no dedicated customer resource. Instead, supporters
 * (one-time tippers) and subscribers (membership holders) represent the
 * platform's audience. Both are derived from the paginated list endpoints
 * and mapped to canonical Customers.
 *
 * The adapter deduplicates by email when building customer lists (see
 * `listCustomers` in index.ts). This transform is a pure function — it
 * operates on a single raw record.
 *
 * Supporter key mapping:
 *  - `payer_email` / `supporter_email`  → canonical `id` + `email`
 *  - `payer_name` / `supporter_name`    → canonical `firstName` + `lastName`
 *  - `support_created_on`               → canonical `createdAt`
 *  - Always `tags: ['supporter']`
 *
 * Subscription key mapping:
 *  - `subscriber_email`      → canonical `id` + `email`
 *  - `subscriber_name`       → canonical `firstName` + `lastName`
 *  - `membership_level_name` → tag `tier:<name>`
 *  - `subscription_created_on` → canonical `createdAt`
 *  - Always `tags: ['subscriber']`
 *  - Additional tag `cancelled` when subscription_is_cancelled is true
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { BmacSupporter, BmacSubscription } from './order'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Best-effort split of a full display name into first / last.
 */
function splitName(
  fullName: string | null | undefined,
): { firstName?: string; lastName?: string } {
  if (!fullName) return {}
  const parts = fullName.trim().split(/\s+/)
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

/**
 * Buy Me a Coffee supporter (one-time tipper) → canonical Customer.
 */
export function transformSupporterAsCustomer(raw: BmacSupporter): Customer {
  const email =
    raw.payer_email ?? raw.supporter_email ?? raw.support_email ?? undefined
  const id = email ?? String(raw.support_id)
  const name = raw.payer_name ?? raw.supporter_name
  const { firstName, lastName } = splitName(name)

  const tags: string[] = ['supporter']
  if (raw.is_refunded) tags.push('refunded')

  return {
    id,
    email,
    firstName,
    lastName,
    tags,
    createdAt: toIsoDatetime(raw.support_created_on),
    updatedAt: toIsoDatetime(raw.support_updated_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Buy Me a Coffee subscription (membership) → canonical Customer.
 */
export function transformSubscriptionAsCustomer(raw: BmacSubscription): Customer {
  const email = raw.subscriber_email ?? undefined
  const id = email ?? String(raw.subscription_id)
  const { firstName, lastName } = splitName(raw.subscriber_name)

  const tags: string[] = ['subscriber']
  if (raw.membership_level_name) tags.push(`tier:${raw.membership_level_name}`)
  if (raw.subscription_is_cancelled) tags.push('cancelled')

  return {
    id,
    email,
    firstName,
    lastName,
    tags,
    createdAt: toIsoDatetime(raw.subscription_created_on),
    updatedAt: toIsoDatetime(raw.subscription_updated_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
