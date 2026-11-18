import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

/**
 * SMC3 CarrierConnect XL — carrier service entry.
 * Returned from POST /carrierservices.
 */
export interface Smc3CarrierService {
  scac?: string | null
  carrierName?: string | null
  serviceCode?: string | null
  serviceName?: string | null
  transitDays?: number | null
  isAvailable?: boolean | null
  effectiveDate?: string | null
  [key: string]: unknown
}

export interface Smc3CarrierServicesResponse {
  carrierServices?: Smc3CarrierService[] | null
  messageStatus?: Smc3MessageStatus | null
  [key: string]: unknown
}

export interface Smc3MessageStatus {
  message?: string | null
  status?: string | null
  code?: string | null
  [key: string]: unknown
}

/**
 * Group raw carrier service rows by SCAC code into canonical Carrier objects.
 */
export function transformCarrierServices(raw: Smc3CarrierServicesResponse): Carrier[] {
  const rows = raw.carrierServices ?? []
  const byScac = new Map<string, Carrier>()

  for (const row of rows) {
    const scac = (row.scac ?? '').trim()
    if (!scac) continue

    let carrier = byScac.get(scac)
    if (!carrier) {
      carrier = {
        id: scac,
        code: scac,
        name: row.carrierName ?? undefined,
        isActive: row.isAvailable ?? undefined,
        services: [],
        createdAt: toISODate(row.effectiveDate),
        metadata: raw as Record<string, unknown>,
      }
      byScac.set(scac, carrier)
    }

    if (row.serviceCode) {
      carrier.services = carrier.services ?? []
      carrier.services.push({
        code: row.serviceCode,
        name: row.serviceName ?? undefined,
        transitDaysMin: row.transitDays ?? undefined,
        transitDaysMax: row.transitDays ?? undefined,
      })
    }
  }

  return Array.from(byScac.values())
}

/**
 * Transform a single carrier-services response row into a Carrier.
 * Used when fetching a single SCAC.
 */
export function transformSingleCarrier(scac: string, rows: Smc3CarrierService[]): Carrier {
  const first = rows[0]
  return {
    id: scac,
    code: scac,
    name: first?.carrierName ?? undefined,
    isActive: first?.isAvailable ?? undefined,
    services: rows
      .filter((r) => r.serviceCode)
      .map((r) => ({
        code: r.serviceCode!,
        name: r.serviceName ?? undefined,
        transitDaysMin: r.transitDays ?? undefined,
        transitDaysMax: r.transitDays ?? undefined,
      })),
    metadata: { rows } as Record<string, unknown>,
  }
}
