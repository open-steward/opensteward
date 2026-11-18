/**
 * pandago outlet → canonical logistics Warehouse.
 *
 * pandago "outlets" are vendor branch locations that serve as pickup points
 * for on-demand delivery orders. They are managed via:
 *   PUT    /outlets/{client_vendor_id}  — create or update
 *   GET    /outlets/{client_vendor_id}  — retrieve one
 *   PATCH  /outlets/{client_vendor_id}  — partial update
 *   GET    /outletList                  — list all for the parent vendor
 *
 * pandago outlets do not carry timestamps, so createdAt/updatedAt are omitted.
 *
 * Docs: https://on-demand-rider-docs.deliveryhero.io/
 */
import type { Warehouse } from '../../../schema/warehouse'

// ─── pandago raw types ─────────────────────────────────────────────────────

export interface PandagoOutlet {
  client_vendor_id?: string | null
  vendor_id?: string | null
  name?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  city?: string | null
  phone_number?: string | null
  currency?: string | null
  locale?: string | null
  description?: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformWarehouse(raw: PandagoOutlet): Warehouse {
  return {
    id: raw.client_vendor_id ?? raw.vendor_id ?? undefined,
    name: raw.name ?? undefined,
    code: raw.client_vendor_id ?? undefined,
    address: raw.address
      ? {
          street1: raw.address,
          city: raw.city ?? undefined,
          phone: raw.phone_number ?? undefined,
        }
      : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
