/**
 * Correo Argentino MiCorreo API — agencies response → canonical Warehouse.
 *
 * GET /agencies accepts a `provincia` query param (province code) and returns
 * an array of agency/branch objects. Agencies are the physical dropoff/pickup
 * branches of Correo Argentino and map to the canonical Warehouse resource.
 *
 * Documented endpoint: GET https://api.correoargentino.com.ar/micorreo/v1/agencies
 * Source: Correo Argentino API MiCorreo documentation (apiMiCorreo.pdf, page 29)
 * SDK reference: https://github.com/YamilEzequiel/correo-argentino
 */
import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

// ─── Correo Argentino raw types ───────────────────────────────────────────

export interface CorreoArgentinoAgency {
  /** Agency unique identifier */
  sucursal_id: string | null
  /** Internal agency code */
  codigo: string | null
  /** Agency display name */
  nombre: string | null
  /** Street address line */
  direccion: string | null
  /** City/locality */
  localidad: string | null
  /** Province name or code */
  provincia: string | null
  /** Postal code */
  codigo_postal: string | null
  /** Phone contact */
  telefono: string | null
  /** Operating hours (free-text) */
  horario: string | null
  /** Whether the agency is currently active */
  activo: boolean | null
  [key: string]: unknown
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toAddress(raw: CorreoArgentinoAgency): Address | undefined {
  const hasAny = raw.direccion || raw.localidad || raw.provincia || raw.codigo_postal
  if (!hasAny) return undefined
  return {
    street1: raw.direccion ?? undefined,
    city: raw.localidad ?? undefined,
    state: raw.provincia ?? undefined,
    postalCode: raw.codigo_postal ?? undefined,
    country: 'AR',
    phone: raw.telefono ?? undefined,
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformWarehouse(raw: CorreoArgentinoAgency): Warehouse {
  return {
    id: raw.sucursal_id ?? raw.codigo ?? undefined,
    name: raw.nombre ?? undefined,
    code: raw.codigo ?? undefined,
    address: toAddress(raw),
    isActive: raw.activo ?? true,
    metadata: raw as Record<string, unknown>,
  }
}
