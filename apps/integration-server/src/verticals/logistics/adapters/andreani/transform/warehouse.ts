/**
 * Andreani REST API v2 — sucursales response → canonical Warehouse.
 *
 * GET /v2/sucursales returns an array of SucursalCompletoV2 objects.
 * Sucursales are Andreani's physical branches used as pickup/dropoff points,
 * which map to the canonical Warehouse resource.
 *
 * Docs: https://developers.andreani.com/documentacion
 * Source reference: https://github.com/nchsala/andreani (src/models/sucursales.model.ts)
 */
import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

// ─── Andreani raw types ────────────────────────────────────────────────────

export interface AndreaniDireccion {
  calle?: string | null
  numero?: string | null
  localidad?: string | null
  codigoPostal?: string | null
  region?: string | null
  pais?: string | null
  [key: string]: unknown
}

export interface AndreaniCoordenadas {
  latitud?: number | null
  longitud?: number | null
  [key: string]: unknown
}

export interface AndreaniSucursal {
  id?: number | string | null
  codigo?: string | null
  numero?: string | null
  descripcion?: string | null
  canal?: string | null
  direccion?: AndreaniDireccion | null
  coordenadas?: AndreaniCoordenadas | null
  horarioDeAtencion?: string | null
  codigosPostalesAtendidos?: string[] | null
  [key: string]: unknown
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toAddress(dir: AndreaniDireccion | null | undefined): Address | undefined {
  if (!dir) return undefined
  const street1 = [dir.calle, dir.numero].filter(Boolean).join(' ') || undefined
  return {
    street1,
    city: dir.localidad ?? undefined,
    state: dir.region ?? undefined,
    postalCode: dir.codigoPostal ?? undefined,
    country: dir.pais ?? 'AR',
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformWarehouse(raw: AndreaniSucursal): Warehouse {
  return {
    id: String(raw.id ?? raw.codigo ?? raw.numero ?? ''),
    name: raw.descripcion ?? undefined,
    code: raw.codigo ?? raw.numero ?? undefined,
    address: toAddress(raw.direccion),
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
