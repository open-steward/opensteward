/**
 * VosFactures → canonical Organization transform.
 *
 * VosFactures exposes company info through the /departments endpoint.  The
 * first (or default) department represents the main seller entity.
 *
 * Docs: https://github.com/vosfactures/API
 */
import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

// ── VosFactures raw shape ─────────────────────────────────────────────────

export interface VosFacturesDepartment {
  id?: number
  name?: string
  shortcut?: string
  tax_no?: string
  post_code?: string
  city?: string
  street?: string
  country?: string
  email?: string
  phone?: string
  bank?: string
  bank_account?: string
  www?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────

export function transformOrganization(raw: VosFacturesDepartment): Organization {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    organizationCode: raw.shortcut || undefined,
    taxNumber: raw.tax_no || undefined,
    website: raw.www || undefined,
    address: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.post_code,
      country: raw.country,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
