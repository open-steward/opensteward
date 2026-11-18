/**
 * MyCashflow Stock Location → canonical Location.
 *
 * MyCashflow lists stock locations at `GET /v1/stock-locations`
 * (operationId `indexStockLocations`) and reads one at
 * `GET /v1/stock-locations/{locationCode}` (operationId `getStockLocation`).
 * The documented `Stock Location` schema has exactly four properties:
 *
 *   created_at  "The date and time the item was created."
 *   updated_at  "The date and time the item was last updated."
 *   name        "Name of the stock location"   (required)
 *   code        "The stock location code"      (example "london-1", readOnly)
 *
 * `code` is the only identifier, and it is what the get path takes, so it is
 * the canonical id. The schema documents no address, phone or active flag, so
 * none is mapped.
 *
 * Docs: https://support.mycashflow.com/api/#tag/Stock/operation/indexStockLocations
 */

import type { Location } from '../../../schema/location'

export interface RawMyCashflowLocation {
  created_at?: string
  updated_at?: string
  name: string
  code?: string
}

export function transformLocation(raw: RawMyCashflowLocation): Location {
  if (typeof raw.code !== 'string' || raw.code === '') {
    throw new Error('MyCashflow stock location has no `code`, its only identifier')
  }
  return {
    id: raw.code,
    name: raw.name,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
