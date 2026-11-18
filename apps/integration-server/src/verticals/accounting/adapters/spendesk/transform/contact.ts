/**
 * Spendesk Supplier → canonical Contact
 *
 * Spendesk exposes two contact types:
 *   - Supplier  (from GET /v1/suppliers)  → isSupplier=true
 *   - User      (from GET /v1/users)      → Spendesk employee/team member
 *
 * Supplier fields:
 *   id    ← supplier.id
 *   name  ← supplier.name
 *
 * User fields:
 *   id        ← user.id
 *   firstName ← user.firstName
 *   lastName  ← user.lastName
 *   emails    ← user.email
 */

import type { Contact } from '../../../schema/contact'
import type { Email } from '../../../schema/shared'

// ── Spendesk API types ────────────────────────────────────────────────────────

export interface SpendeskSupplier {
  id: string
  name: string
  [key: string]: unknown
}

export interface SpendeskUser {
  id: string
  firstName: string
  lastName: string
  email: string
  [key: string]: unknown
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformSupplier(raw: SpendeskSupplier): Contact {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    isCustomer: false,
    isSupplier: true,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformUser(raw: SpendeskUser): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []
  const name =
    [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined

  return {
    id: raw.id || undefined,
    name,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    isCustomer: false,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
