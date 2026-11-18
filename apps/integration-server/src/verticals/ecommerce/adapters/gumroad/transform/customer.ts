/**
 * Gumroad Subscriber → canonical Customer.
 *
 * Gumroad exposes subscribers (recurring membership/product buyers) via
 * the `/products/:product_id/subscribers` endpoint. Each subscriber has
 * an `id`, `email`, `status`, and subscription-specific fields.
 *
 * Key mapping:
 *  - `id` → canonical `id`
 *  - `email` → canonical `email`
 *  - `status` (alive/dead) → tags
 *  - `created_at` → canonical `createdAt`
 *
 * Note: Gumroad does NOT have a general "customer" resource. Subscribers
 * are the closest analogue, scoped to a product.
 */

import type { Customer } from '../../../schema/customer'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawGumroadSubscriber {
  id: string
  email?: string
  status?: string // 'alive' or 'dead'
  product_id?: string
  product_name?: string
  user_id?: string | null
  user_email?: string
  created_at?: string
  ended_at?: string | null
  charge_occurrence_count?: number | null
  license_key?: string | null
  free_trial_ends_on?: string | null
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawGumroadSubscriber): Customer {
  const tags: string[] = []
  if (raw.status) tags.push(raw.status)
  if (raw.product_name) tags.push(`product:${raw.product_name}`)

  return {
    id: raw.id,
    email: raw.email ?? raw.user_email ?? undefined,
    tags: tags.length > 0 ? tags : undefined,
    createdAt: raw.created_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
