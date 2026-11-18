import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

/**
 * One row of `POST warehouse/get.json`
 * (https://docs.ithinklogistics.com/doc-get-warehouse/3): "Retrieve the list
 * of registered warehouse and determine the status of warehouse". The
 * documented row is `id`, `company_name`, `mobile`, `address1`, `address2`,
 * `pincode`, `city_name`, `state_name`, `country_name`, `status` ("approved").
 *
 * `country_name` is a name ("India"), not ISO 3166 alpha-2, so it stays on
 * `metadata` only.
 */
export interface IthinkLogisticsWarehouseRaw {
  id?: string | number | null
  company_name?: string | null
  mobile?: string | null
  address1?: string | null
  address2?: string | null
  pincode?: string | number | null
  city_name?: string | null
  state_name?: string | null
  country_name?: string | null
  status?: string | null
  [key: string]: unknown
}

function text(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

export function transformWarehouse(raw: IthinkLogisticsWarehouseRaw): Warehouse {
  const id = text(raw.id)
  if (!id) throw new Error('iThink Logistics warehouse row has no id')
  const address: Address = {
    company: text(raw.company_name),
    street1: text(raw.address1),
    street2: text(raw.address2),
    city: text(raw.city_name),
    state: text(raw.state_name),
    postalCode: text(raw.pincode),
    phone: text(raw.mobile),
  }
  const set = Object.fromEntries(
    Object.entries(address).filter(([, v]) => v !== undefined),
  ) as Address
  return {
    id,
    name: text(raw.company_name),
    address: Object.keys(set).length > 0 ? set : undefined,
    // "approved" is the only documented status value; others are not read as inactive.
    isActive: text(raw.status)?.toLowerCase() === 'approved' ? true : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
