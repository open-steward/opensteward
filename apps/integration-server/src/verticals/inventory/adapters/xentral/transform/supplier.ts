/**
 * Transform a raw Xentral supplier object to the canonical Supplier schema.
 *
 * Source: GET /api/v1/suppliers  /  GET /api/v1/suppliers/{id}
 *
 * Key field mappings:
 *   id                   → id / externalId
 *   general.name         → name
 *   general.email        → email  (note: top-level `general` sub-object)
 *   general.phone        → phone
 *   general.address.*    → address
 *   general.supplierNumber → metadata
 *   type                 → metadata.type
 * No isActive flag or currency field on the V1 supplier endpoint;
 * defaulting isActive=true unless tags contain a known inactive tag.
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

interface XentralSupplierGeneral {
  name?: string
  email?: string
  phone?: string
  fax?: string
  mobile?: string
  department?: string
  supplierNumber?: string
  address?: {
    street?: string
    zip?: string
    city?: string
    state?: string
    country?: string
    note?: string
  }
  [key: string]: unknown
}

export interface RawXentralSupplier {
  id: string
  type?: string
  general?: XentralSupplierGeneral
  tags?: Array<{ id?: string; key?: string; name?: string; color?: string }>
  freeFields?: Array<{ id?: string; value?: string }>
  [key: string]: unknown
}

export function transformSupplier(raw: RawXentralSupplier): Supplier {
  const g = raw.general ?? {}

  // Treat supplier as inactive if any tag explicitly signals it
  const tagNames = (raw.tags ?? []).map((t) => (t.name ?? '').toLowerCase())
  const isActive = !tagNames.some((n) => n === 'inactive' || n === 'deactivated' || n === 'disabled')

  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(g.name) ?? '',
    email: pickStr(g.email),
    phone: pickStr(g.phone) ?? pickStr(g.mobile),
    isActive,
    platform: 'xentral',
    metadata: strMap({
      type: raw.type,
      supplierNumber: g.supplierNumber,
      department: g.department,
    }),
    raw,
  }
}
