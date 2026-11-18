import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

/**
 * The `data` object of `GET /carrier/{carrier_id}` (Queries API):
 * https://docs.envia.com/reference/carrier-by-id.md
 * documents `id` (integer), `name`, `code`, `active` and `services[]` of
 * `{ id, name, code }`.
 */
export interface EnviaCarrier {
  id?: number | null
  name?: string | null
  code?: string | null
  active?: boolean | null
  services?: Array<{ id?: number | null; name?: string | null; code?: string | null }> | null
  [key: string]: unknown
}

export function transformCarrier(raw: EnviaCarrier): Carrier {
  const services: CarrierService[] = (raw.services ?? []).flatMap((s) =>
    s.code ? [{ code: s.code, name: s.name ?? undefined }] : [],
  )
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    isActive: raw.active ?? undefined,
    services: services.length > 0 ? services : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
