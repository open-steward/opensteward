/**
 * Ramp vendor → canonical Contact (supplier).
 *
 * Ramp endpoint: GET /developer/v1/accounting/vendors
 *
 * Ramp tracks vendor entries in the accounting namespace. These are
 * supplier-side contacts (no customer concept in the Ramp data model).
 *
 * Key fields:
 *   id           string (UUID) — Ramp internal vendor ID
 *   remote_id    string        — ERP/external system vendor ID
 *   name         string
 *   is_active    boolean
 *   is_synced    boolean
 *   accounting_connection_id string
 */

import type { Contact } from '../../../schema/contact'

export interface RampVendor {
  id: string
  remote_id?: string
  name?: string
  is_active?: boolean
  is_synced?: boolean
  accounting_connection_id?: string
  [key: string]: unknown
}

export function transformVendor(raw: RampVendor): Contact {
  return {
    id: raw.id,
    name: raw.name || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.is_active !== false,
    metadata: raw as Record<string, unknown>,
  }
}
