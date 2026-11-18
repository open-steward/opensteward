/**
 * Deposco facility → canonical Warehouse.
 *
 * Source: `FacilityDTO`, returned by
 *   GET /facilities              ("Get a list of facilities")
 *   GET /facilities/{facilityId} ("Get a facility")
 * in https://auth.deposco.com/public/spec?version=latest.
 *
 * The DTO documents no active flag and no cut-off time, so `isActive` and
 * `cutoffTime` are left unset.
 */
import type { Warehouse } from '../../../schema/warehouse'
import {
  selfId,
  toDate,
  toDeposcoAddress,
  type DeposcoAddressFields,
  type DeposcoEntityRef,
} from '../dto'

export interface DeposcoFacility {
  /** `self.id` is the `{facilityId}` of GET /facilities/{facilityId}. */
  self?: DeposcoEntityRef | null
  /** "Unique code that identifies the facility." */
  number?: string | null
  /** "Name of the facility." */
  name?: string | null
  /** "Primary phone number for the facility." */
  phone?: string | null
  /** "Address for the facility." */
  address?: DeposcoAddressFields | null
  /** "Time zone in which the resource is located." (tz database names such as `US/Eastern`) */
  timeZone?: string | null
  /** "Date and time that the facility was created." */
  createdDate?: string | null
  /** "Date and time that the facility was last updated." */
  updatedDate?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: DeposcoFacility): Warehouse {
  return {
    id: selfId(raw.self),
    name: raw.name || undefined,
    code: raw.number || undefined,
    address: toDeposcoAddress(raw.address, { phone: raw.phone }),
    timezone: raw.timeZone || undefined,
    createdAt: toDate(raw.createdDate),
    updatedAt: toDate(raw.updatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
