/**
 * Maps the Firefly III /v1/about/user (UserGroupReadAttributes) response to
 * the canonical Organization type.
 *
 * Firefly III does not expose a dedicated "company/organization" resource.
 * The closest equivalent is the User Group ("financial administration"), which
 * has a title and a primary currency.
 */

import type { Organization } from '../../../schema/organization'

// ── Firefly III raw type ────────────────────────────────────────────────────────

export interface FireflyUserGroupAttributes {
  created_at?: string
  updated_at?: string
  title: string
  primary_currency_code: string
  primary_currency_id?: string
  in_use?: boolean
  [key: string]: unknown
}

export type FireflyUserGroupResource = {
  type: string
  id: string
  attributes: FireflyUserGroupAttributes
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: FireflyUserGroupResource): Organization {
  const attrs = raw.attributes
  return {
    id: raw.id,
    name: attrs.title || undefined,
    currency: attrs.primary_currency_code || undefined,
    createdAt: attrs.created_at ? new Date(attrs.created_at) : undefined,
    updatedAt: attrs.updated_at ? new Date(attrs.updated_at) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
