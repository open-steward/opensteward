/**
 * Infoplus warehouse → canonical Warehouse transform.
 *
 * Fields read, all from the `warehouse` definition in the v2.0 swagger
 * (https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json):
 * `id` (integer), `name`, `company`, `street1`, `street2`, `city`, `state`,
 * `zip`, `phone` (strings) and `createDate` / `modifyDate` (date-time).
 *
 * `country` is a free string with no documented format, so it is not mapped
 * to the ISO 3166 alpha-2 `Address.country`; it stays in `metadata`.
 */

import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface InfoplusWarehouse {
  id?: number | null
  client?: number | null
  name?: string | null
  address?: string | null
  company?: string | null
  street1?: string | null
  street2?: string | null
  street3?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  createDate?: string | null
  modifyDate?: string | null
  [key: string]: unknown
}

const text = (v: string | null | undefined): string | undefined =>
  v === null || v === undefined || v === '' ? undefined : v

function warehouseAddress(raw: InfoplusWarehouse): Address | undefined {
  const addr: Address = {
    company: text(raw.company),
    street1: text(raw.street1),
    street2: text(raw.street2),
    city: text(raw.city),
    state: text(raw.state),
    postalCode: text(raw.zip),
    phone: text(raw.phone),
  }
  return Object.values(addr).some((v) => v !== undefined) ? addr : undefined
}

export function transformWarehouse(raw: InfoplusWarehouse): Warehouse {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: text(raw.name),
    address: warehouseAddress(raw),
    createdAt: toISODate(raw.createDate),
    updatedAt: toISODate(raw.modifyDate),
    metadata: raw as Record<string, unknown>,
  }
}
