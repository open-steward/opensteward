import type { Carrier } from '../../../schema/carrier'
import type { SkydropxPageMeta } from './shipment'

/**
 * One row of GET /api/v1/shipments/carrier_services ("Obtiene todos los
 * servicios", "Este endpoint obtiene todos los servicios de transportadora
 * disponibles"), from https://pro.skydropx.com/es-MX/api-docs.json:
 *
 *   carrier_name "Nombre de la transportadora" (example "fedex")
 *   service_name "Nombre del servicio de la transportadora"
 *   service_code "Código único del servicio de la transportadora"
 */
export interface SkydropxCarrierService {
  carrier_name?: string | null
  service_name?: string | null
  service_code?: string | null
  min_delivery_packages?: number | null
  is_national?: boolean | null
  volumetric_weight_formula?: string | null
  has_pickup?: boolean | null
  multi_packages_enabled?: boolean | null
  is_ltl?: boolean | null
  package_type?: string | null
  has_reschedule_pick?: boolean | null
}

export interface SkydropxCarrierServicesResponse {
  data?: SkydropxCarrierService[] | null
  meta?: SkydropxPageMeta | null
}

/**
 * Group the service catalogue into one Carrier per `carrier_name`, in the
 * order carriers first appear. Every row must be the whole catalogue: a
 * carrier's services can span upstream pages. Rows without a carrier name are
 * dropped, and a service without a `service_code` is not listed as a service
 * (CarrierService.code is required), though it stays in `metadata`.
 */
export function groupCarrierServices(rows: readonly SkydropxCarrierService[]): Carrier[] {
  const byName = new Map<string, SkydropxCarrierService[]>()
  for (const row of rows) {
    const name = row.carrier_name
    if (typeof name !== 'string' || name === '') continue
    const list = byName.get(name)
    if (list) list.push(row)
    else byName.set(name, [row])
  }
  return [...byName.entries()].map(([name, services]) => transformCarrier(name, services))
}

export function transformCarrier(name: string, services: SkydropxCarrierService[]): Carrier {
  return {
    id: name,
    name,
    code: name,
    services: services
      .filter((s) => typeof s.service_code === 'string' && s.service_code !== '')
      .map((s) => ({
        code: s.service_code as string,
        name:
          typeof s.service_name === 'string' && s.service_name !== '' ? s.service_name : undefined,
      })),
    metadata: { carrier_services: services },
  }
}
