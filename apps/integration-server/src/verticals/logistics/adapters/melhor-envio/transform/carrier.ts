import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

// ─── Melhor Envio raw types ───────────────────────────────────────────────────

/**
 * One service of a carrier, as documented under `services[]` in the 200
 * response of GET /api/v2/me/shipment/companies
 * (https://docs.melhorenvio.com.br/reference/listar-transportadoras.md).
 */
export interface MelhorEnvioCarrierService {
  id?: number | null
  name?: string | null
  /** e.g. "normal" / "express" in the documented example. */
  type?: string | null
  /** e.g. "interstate" in the documented example. */
  range?: string | null
  restrictions?: Record<string, unknown> | null
  requirements?: string[] | null
  optionals?: string[] | null
  company?: Record<string, unknown> | null
  [key: string]: unknown
}

/**
 * One item of the documented array returned by
 * GET /api/v2/me/shipment/companies: `{ id, name, picture, services }`.
 * The item documents no status and no timestamps.
 */
export interface MelhorEnvioCarrier {
  id?: number | null
  name?: string | null
  picture?: string | null
  services?: MelhorEnvioCarrierService[] | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * The reference warns "Não faça verificações pelo nome da transportadora ou
 * serviço, pois podem sofrer alterações", so no code is derived from a name:
 * a service's code is its documented numeric id, and a service without one is
 * dropped rather than given an invented code.
 */
export function transformCarrier(raw: MelhorEnvioCarrier): Carrier {
  const services: CarrierService[] | undefined = raw.services
    ? raw.services
        .filter((s) => s.id != null)
        .map((s) => ({ code: String(s.id), ...(s.name != null ? { name: s.name } : {}) }))
    : undefined

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name ?? undefined,
    ...(services ? { services } : {}),
    metadata: raw as Record<string, unknown>,
  }
}
