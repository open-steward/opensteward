/**
 * Drupal User → canonical Customer.
 *
 * Drupal Commerce uses core Drupal user accounts (`user--user`) as customers.
 *
 * JSON:API `user--user` attributes:
 *   - `name`           — username (not necessarily real name)
 *   - `mail`           — email address
 *   - `status`         — boolean (1 = active)
 *   - `created`        — Unix timestamp
 *   - `changed`        — Unix timestamp
 *   - `field_first_name` / `field_last_name` — optional custom fields
 *   - `field_phone`    — optional custom phone field
 *
 * Note: Drupal user accounts are created by Drupal core, not Drupal Commerce.
 * Custom fields (first_name, last_name, phone) are site-specific and may not
 * exist. The adapter reads them gracefully and falls back to undefined.
 */

import type { Customer } from '../../../schema/customer'
import type { JsonApiResource } from '../client'

// ── Raw Drupal shapes ─────────────────────────────────────────────────────────

export interface DrupalUserAttributes {
  name?: string
  mail?: string
  status?: boolean | number
  created?: number | string
  changed?: number | string
  // Optional custom fields (site-specific)
  field_first_name?: string | null
  field_last_name?: string | null
  field_phone?: string | null
  field_display_name?: string | null
  [key: string]: unknown
}

export type DrupalUser = JsonApiResource & {
  attributes: DrupalUserAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToIso(ts: number | string | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!Number.isFinite(n) || n <= 0) return undefined
  return new Date(n * 1000).toISOString()
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: DrupalUser): Customer {
  const attrs = raw.attributes
  const firstName = attrs.field_first_name ?? undefined
  const lastName = attrs.field_last_name ?? undefined

  return {
    id: raw.id,
    email: attrs.mail ?? undefined,
    firstName,
    lastName,
    phone: attrs.field_phone ?? undefined,
    // Drupal doesn't expose acceptsMarketing natively without custom modules
    acceptsMarketing: undefined,
    createdAt: unixToIso(attrs.created),
    updatedAt: unixToIso(attrs.changed),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    data: {
      type: 'user--user',
      attributes: {
        ...(customer.email != null ? { mail: customer.email } : {}),
        ...(customer.firstName != null ? { field_first_name: customer.firstName } : {}),
        ...(customer.lastName != null ? { field_last_name: customer.lastName } : {}),
        ...(customer.phone != null ? { field_phone: customer.phone } : {}),
      },
    },
  }
}
