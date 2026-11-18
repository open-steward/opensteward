import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// Royal Mail Shipping API v3 — POST /manifests response shapes.
// Source: github.com/zVPS/royal-mail-shipping-rest-api-client/blob/master/docs/Model/Manifest.md

export interface RoyalMailManifestItem {
  manifestNumber?: string
  manifestImage?: string // base64-encoded PDF
  carrierCode?: string
  serviceCode?: string
  totalWeight?: number
  totalPackages?: number
  [key: string]: unknown
}

export interface RoyalMailManifestResponse {
  postingLocation?: string
  manifests?: RoyalMailManifestItem[]
  httpStatusCode?: number
  httpStatusDescription?: string
  message?: string
  [key: string]: unknown
}

export function transformManifest(
  raw: RoyalMailManifestItem,
  createdAt?: string,
): Manifest {
  return {
    id: raw.manifestNumber,
    carrierId: raw.carrierCode ?? 'royalmail',
    manifestNumber: raw.manifestNumber,
    status: 'SUBMITTED',
    labelCount: raw.totalPackages,
    submittedAt: toISODate(createdAt ?? new Date().toISOString()),
    createdAt: toISODate(createdAt ?? new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
