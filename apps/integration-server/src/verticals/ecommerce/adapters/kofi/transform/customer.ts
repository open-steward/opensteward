/**
 * Ko-fi Webhook Payload → canonical Customer.
 *
 * Ko-fi has no dedicated customer or subscriber resource in its API. The only
 * supporter data available arrives inside the webhook payload at the moment of
 * a transaction. This transform derives a canonical Customer from that data.
 *
 * Key mapping:
 *  - `email`           → canonical `id` (email is the stable identifier on Ko-fi)
 *  - `from_name`       → canonical `firstName` (Ko-fi provides a single display name)
 *  - `email`           → canonical `email`
 *  - `type`            → `tags` (Donation / Subscription / Shop Order / Commission)
 *  - `tier_name`       → `tags` when present (`tier:<name>`)
 *  - `timestamp`       → canonical `createdAt` (first-seen approximation)
 *
 * Note: Because Ko-fi does not expose a stable numeric customer ID, the email
 * address is used as the canonical `id`. Callers should deduplicate by email
 * when aggregating multiple webhooks from the same supporter.
 */

import type { Customer } from '../../../schema/customer'
import type { KofiWebhookPayload } from './order'

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Ko-fi webhook payload → canonical Customer.
 */
export function transformCustomer(raw: KofiWebhookPayload): Customer {
  const tags: string[] = []
  if (raw.type) tags.push(raw.type)
  if (raw.tier_name) tags.push(`tier:${raw.tier_name}`)
  if (raw.is_first_subscription_payment) tags.push('new_subscriber')

  // Split a single display name into first / last (best-effort)
  let firstName: string | undefined
  let lastName: string | undefined
  if (raw.from_name) {
    const parts = raw.from_name.trim().split(/\s+/)
    firstName = parts[0]
    lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined
  }

  return {
    // Use email as stable ID; prefer transaction ID over message_id as fallback
    id: raw.email ?? raw.kofi_transaction_id ?? raw.message_id ?? 'unknown',
    email: raw.email ?? undefined,
    firstName,
    lastName,
    tags: tags.length > 0 ? tags : undefined,
    createdAt: raw.timestamp ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
