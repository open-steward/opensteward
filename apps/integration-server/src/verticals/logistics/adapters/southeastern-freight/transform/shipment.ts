/**
 * Transform SEFL pickup API responses → canonical Shipment.
 *
 * Pickup response schema (from sampleResponse.json):
 * {
 *   confirmation: {
 *     confirmationNumber: string   // e.g. "ABC12345"
 *     dateTimeSubmitted: string    // "20231201092254429" (YYYYMMDDHHmmssSSS)
 *     totalShipments: number
 *     totalWeight: number
 *     directPartner: string        // "Direct" | "Partner"
 *   }
 *   message: string
 * }
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Shipment } from '../../../schema/shipment'

export interface SeflConfirmation {
  confirmationNumber?: string
  dateTimeSubmitted?: string
  totalShipments?: number
  totalWeight?: number
  directPartner?: string
  [key: string]: unknown
}

export interface SeflPickupResponse {
  confirmation?: SeflConfirmation
  message?: string
  [key: string]: unknown
}

/**
 * Parse SEFL's compact datetime format: "YYYYMMDDHHmmssSSS"
 * Returns a Date or undefined if the string is malformed.
 */
function parseSeflDatetime(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  // Minimum: 8 chars (YYYYMMDD); full: 17 chars
  if (raw.length < 8) return undefined
  const year = raw.slice(0, 4)
  const month = raw.slice(4, 6)
  const day = raw.slice(6, 8)
  const hour = raw.slice(8, 10) || '00'
  const min = raw.slice(10, 12) || '00'
  const sec = raw.slice(12, 14) || '00'
  const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}Z`
  const s = toIsoDatetime(iso)
  return s ? new Date(s) : undefined
}

export function transformShipment(raw: SeflPickupResponse): Shipment {
  const conf = raw.confirmation ?? {}

  const createdAt =
    parseSeflDatetime(conf.dateTimeSubmitted) ??
    new Date(toIsoDatetime(new Date().toISOString())!)

  return {
    id: conf.confirmationNumber ?? undefined,
    status: 'PENDING',
    trackingNumber: conf.confirmationNumber ?? undefined,
    carrierId: 'southeastern-freight',
    reference: conf.confirmationNumber ?? undefined,
    createdAt,
    metadata: raw as Record<string, unknown>,
  }
}
