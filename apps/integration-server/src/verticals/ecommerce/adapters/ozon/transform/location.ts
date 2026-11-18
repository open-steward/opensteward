/**
 * Ozon warehouse → canonical Location.
 *
 * `POST /v1/warehouse/list` returns the seller's own FBS/rFBS warehouses —
 * the places Ozon postings are packed and shipped from — so each is a
 * fulfilment location. The method returns no address.
 *
 * Warehouse status (spec table): `new` activating, `created` active,
 * `disabled` archived, `blocked`, `disabled_due_to_limit` paused, `error`.
 *
 * Docs: https://docs.ozon.ru/api/seller/ (WarehouseAPI)
 */
import type { Location } from '../../../schema/location'

export interface RawOzonWarehouse {
  warehouse_id: number
  name: string
  status?: string
  is_rfbs?: boolean
  [key: string]: unknown
}

export function transformLocation(raw: RawOzonWarehouse): Location {
  return {
    id: String(raw.warehouse_id),
    name: raw.name,
    active: raw.status === undefined ? undefined : raw.status === 'created',
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
