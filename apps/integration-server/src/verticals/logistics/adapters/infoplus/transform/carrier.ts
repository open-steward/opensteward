/**
 * Infoplus carrier → canonical Carrier transform.
 *
 * The `carrier` definition in the v2.0 swagger
 * (https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json)
 * has exactly two properties, both required: `carrier` (integer, int32) and
 * `label` (string). `GET /v2.0/carrier/{carrierId}` is "Get a carrier by id",
 * so `carrier` is the id.
 */

import type { Carrier } from '../../../schema/carrier'

export interface InfoplusCarrier {
  carrier?: number | null
  label?: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: InfoplusCarrier): Carrier {
  return {
    id: raw.carrier != null ? String(raw.carrier) : undefined,
    name: raw.label ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
