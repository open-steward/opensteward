import type { Carrier } from '../../../schema/carrier'

/**
 * One item of `GET /v2/providers/` ("Get information about all integration",
 * https://kitchenhub.readme.io/reference/get_v2-providers-1.md), schema
 * ProviderGeneralInfoSerializer: `provider_name` and `provider_id` are
 * required; the capability objects are optional.
 */
export interface KitchenHubProvider {
  provider_id: string
  provider_name: string
  provider_capabilities?: Record<string, unknown> | null
  pos_capabilities?: Record<string, unknown> | null
  delivery_capabilities?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformProvider(raw: KitchenHubProvider): Carrier {
  return {
    id: raw.provider_id,
    code: raw.provider_id,
    name: raw.provider_name,
    metadata: raw as Record<string, unknown>,
  }
}
