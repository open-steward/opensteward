/**
 * Parcel2Go services → canonical Carrier.
 *
 * Parcel2Go documents no courier resource: its Swagger
 * (https://www.parcel2go.com/api/swagger/docs/v1) has no path containing
 * "couriers". What it documents is the service catalogue,
 * `GET /services` — "Get a list of active services" — whose rows
 * (`ExtendedQuoteService`) each name the courier that provides them:
 *
 *   CourierSlug  "A URL friendly unique identifier for the courier."
 *   CourierName  "The name of the courier that provides this service."
 *   Slug         "A URL friendly unique identifier for the service."
 *   Name         "The name of the service."
 *
 * A carrier is therefore one distinct `CourierSlug` over the WHOLE catalogue,
 * carrying the services that name it. Grouping is only ever done over every
 * row of the catalogue, never per upstream page, so a courier whose services
 * straddle two pages is still one carrier.
 */
import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

/** The documented `ExtendedQuoteService` fields this transform reads. */
export interface Parcel2GoService {
  CourierSlug?: string | null
  CourierName?: string | null
  Slug?: string | null
  Name?: string | null
  [key: string]: unknown
}

/** `ServiceResults` — the body of `GET /services`. */
export interface Parcel2GoServiceResults {
  Results?: Parcel2GoService[] | null
  Take?: number | null
  Skip?: number | null
}

function toCarrierService(s: Parcel2GoService): CarrierService | undefined {
  // CarrierService.code is required; a service without its documented slug
  // has nothing to put there, so it is left out rather than given one.
  if (!s.Slug) return undefined
  return { code: s.Slug, ...(s.Name ? { name: s.Name } : {}) }
}

/**
 * One canonical Carrier per distinct `CourierSlug`, in the order each courier
 * first appears in `services`. `services` must be the whole catalogue.
 * A service row with no `CourierSlug` names no courier and yields none.
 */
export function carriersFromServices(services: readonly Parcel2GoService[]): Carrier[] {
  const byCourier = new Map<string, { name?: string; services: CarrierService[] }>()
  for (const s of services) {
    const courier = s.CourierSlug
    if (!courier) continue
    let entry = byCourier.get(courier)
    if (!entry) {
      entry = { services: [] }
      byCourier.set(courier, entry)
    }
    if (!entry.name && s.CourierName) entry.name = s.CourierName
    const svc = toCarrierService(s)
    if (svc) entry.services.push(svc)
  }
  return [...byCourier].map(([slug, e]) => ({
    id: slug,
    code: slug,
    ...(e.name ? { name: e.name } : {}),
    ...(e.services.length > 0 ? { services: e.services } : {}),
  }))
}
