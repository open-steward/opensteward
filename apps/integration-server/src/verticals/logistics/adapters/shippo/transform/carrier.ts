import type { Carrier } from '../../../schema/carrier'

export interface ShippoCarrierAccount {
  object_id: string
  object_owner: string
  carrier: string
  carrier_name: string | null
  account_id: string
  parameters: Record<string, unknown> | null
  active: boolean | null
  is_shippo_account: boolean | null
  metadata: string | null
  service_levels: Array<{
    name: string | null
    token: string | null
    supports_return_labels: boolean | null
  }> | null
  test: boolean
  [key: string]: unknown
}

export function transformCarrier(raw: ShippoCarrierAccount): Carrier {
  return {
    id: raw.object_id,
    name: raw.carrier_name ?? raw.carrier ?? undefined,
    code: raw.carrier ?? undefined,
    isActive: raw.active ?? undefined,
    services: raw.service_levels
      ? raw.service_levels.map((sl) => ({
          code: sl.token ?? '',
          name: sl.name ?? undefined,
        }))
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
