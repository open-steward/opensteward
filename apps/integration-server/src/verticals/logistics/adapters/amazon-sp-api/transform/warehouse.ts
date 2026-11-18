/**
 * Amazon SP-API Supply Sources (2020-07-01) → canonical Warehouse.
 *
 * A supply source is a seller-operated ship-from location (store, warehouse,
 * fulfilment centre) — the nearest thing SP-API has to a warehouse. Two
 * shapes come back:
 *   - GET /supplySources/2020-07-01/supplySources  (getSupplySources)
 *     `supplySources[]` rows carry only alias, supplySourceId,
 *     supplySourceCode and address, plus a top-level `nextPageToken`.
 *   - GET /supplySources/2020-07-01/supplySources/{supplySourceId}  (getSupplySource)
 *     The full record: status, configuration (timezone, operating hours,
 *     contact details), capabilities, createdAt, updatedAt.
 *
 * One transform handles both; fields the list row lacks stay undefined
 * rather than being guessed.
 *
 * Amazon spells its address keys `addressLine1` / `stateOrRegion`, which are
 * not among the aliases the shared `toAddress` reads, so the keys are
 * renamed onto ones it does before it runs. (The ecommerce `amazon-sp`
 * adapter targets a different Address shape, so nothing is borrowed from it.)
 *
 * Docs: https://github.com/amzn/selling-partner-api-models/blob/main/models/supply-sources-api-model/supplySources_2020-07-01.json
 *       operationIds: getSupplySources, getSupplySource
 */
import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'
import { toAddress, toISODate } from '../../shared/transform'

// ─── Raw types ───────────────────────────────────────────────────────────────

export interface SpApiSupplySourceAddress {
  name?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  addressLine3?: string | null
  city?: string | null
  county?: string | null
  district?: string | null
  stateOrRegion?: string | null
  postalCode?: string | null
  /** ISO 3166-1 alpha-2 per the spec. */
  countryCode?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface SpApiSupplySourceContact {
  email?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface SpApiSupplySource {
  supplySourceId?: string | null
  supplySourceCode?: string | null
  alias?: string | null
  /** `Active` | `Inactive` | `Archived` — only on the by-id response. */
  status?: string | null
  address?: SpApiSupplySourceAddress | null
  configuration?: {
    /** IANA / RFC 6557 canonical zone id, e.g. `America/Los_Angeles`. */
    timezone?: string | null
    operationalConfiguration?: {
      contactDetails?: { primary?: SpApiSupplySourceContact | null } | null
      [key: string]: unknown
    } | null
    [key: string]: unknown
  } | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export interface SpApiGetSupplySourcesResponse {
  supplySources?: SpApiSupplySource[] | null
  nextPageToken?: string | null
  [key: string]: unknown
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

/**
 * `status` is only present on the by-id response; list rows carry none, so
 * absent stays undefined rather than guessing.
 */
function mapIsActive(status: string | null | undefined): boolean | undefined {
  switch (status) {
    case 'Active':
      return true
    case 'Inactive':
    case 'Archived':
      return false
    default:
      return undefined
  }
}

/** Amazon allows three address lines; the canonical shape has two, so lines 2 and 3 share `street2`. */
function joinLines(...lines: Array<string | null | undefined>): string | undefined {
  const kept = lines.filter((l): l is string => typeof l === 'string' && l.trim() !== '')
  return kept.length > 0 ? kept.join(', ') : undefined
}

function toSupplySourceAddress(
  raw: SpApiSupplySourceAddress | null | undefined,
  contact: SpApiSupplySourceContact | null | undefined,
): Address | undefined {
  if (!raw && !contact) return undefined
  return toAddress({
    name: raw?.name,
    address1: raw?.addressLine1,
    address2: joinLines(raw?.addressLine2, raw?.addressLine3),
    city: raw?.city,
    state: raw?.stateOrRegion,
    postalCode: raw?.postalCode,
    countryCode: raw?.countryCode,
    // The address's own phone is the one at the door; the contact's is a fallback.
    phone: raw?.phone ?? contact?.phone,
    email: contact?.email,
  })
}

export function transformWarehouse(raw: SpApiSupplySource): Warehouse {
  const contact = raw.configuration?.operationalConfiguration?.contactDetails?.primary
  return {
    id: raw.supplySourceId ?? undefined,
    name: raw.alias ?? undefined,
    code: raw.supplySourceCode ?? undefined,
    address: toSupplySourceAddress(raw.address, contact),
    isActive: mapIsActive(raw.status),
    timezone: raw.configuration?.timezone ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
