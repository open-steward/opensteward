import type { Carrier } from '../../../schema/carrier'

// ─── CTT raw types ─────────────────────────────────────────────────────────
//
// GET /carriers/, "JSON reply data"
// (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/carriers/GET, and the
// same response schema in https://enviosecommerceapi.ctt.pt/v3/openapi/):
// "Carrier Array of objects Carrier information".

export interface CttCarrierOption {
  Id: number
  Name: string
  ClassId?: string
  OptionType?: number
  IsPickup?: boolean
  MapFieldsSelect?: unknown[]
  CompatibleOptionIds?: unknown[]
  OptionFields?: unknown[]
  OptionValues?: unknown
}

export interface CttCarrier {
  /** "The correct carrier id for the carrier". */
  Id: number
  /** "The correct name for the carrier". */
  Name: string
  HasPickup?: boolean
  MapFields?: Array<{ Id: number; Name: string }>
  OptionList?: CttCarrierOption[]
  OtherInfo?: Array<{ Type: number; Value: string }>
}

export interface CttCarrierListResponse {
  /** Singular: the documented array key is `Carrier`. */
  Carrier?: CttCarrier[]
  /**
   * "Error sublist Always returned ... Id ... Info" (Pakketmail page); CTT's
   * OpenAPI types it as `ErrorList`, an array of `{Id, Info}`.
   */
  Error?: CttError | CttError[]
  /** "ErrorList Array of objects ... Id ... Tekst" (Pakketmail page). */
  ErrorList?: Array<{ Id?: number; Tekst?: string }>
}

export interface CttError {
  Id?: number
  Info?: string
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * One carrier set up on the account. `Id` is what a shipment's `CarrierId`
 * names. Options (service levels and extras) stay in metadata: their
 * `OptionType` meanings are not part of the documented reply.
 */
export function transformCarrier(raw: CttCarrier): Carrier {
  return {
    id: String(raw.Id),
    name: raw.Name,
    code: String(raw.Id),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
