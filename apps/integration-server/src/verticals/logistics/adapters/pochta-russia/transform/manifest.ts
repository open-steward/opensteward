import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

/**
 * Pochta Rossii batch (партия) object from the Otpravka API.
 *
 * Endpoints:
 *   GET /1.0/batch                      — list all batches
 *   GET /1.0/batch/{batch_name}         — find batch by name
 *   POST /1.0/user/shipment             — create batch from orders (sending-date, use-online-balance)
 *
 * Response fields sourced from the official Otpravka specification and
 * the lapaygroup/RussianPost PHP SDK source code.
 */
export interface PochtaRussiaBatch {
  'batch-name'?: string | null
  'batch-status'?: string | null
  'mail-type'?: number | null
  'mail-category'?: number | null
  'send-date'?: string | null
  'created-on'?: string | null
  'updated-on'?: string | null
  'shipment-point-index'?: string | number | null
  'shipment-count'?: number | null
  [key: string]: unknown
}

/**
 * Maps Pochta Rossii batch-status strings to canonical ManifestStatus.
 *
 * Known status values from the Otpravka specification:
 *  CREATED        — batch created, orders being added
 *  ACCEPTED       — submitted to post office (checked in, F103 sent)
 *  SENT           — batch dispatched
 *  ARCHIVED       — batch moved to archive
 */
function mapBatchStatus(status: string | null | undefined): ManifestStatus {
  if (!status) return 'OPEN'
  const s = status.toUpperCase()
  if (s === 'CREATED' || s === 'IN_PROGRESS') return 'OPEN'
  if (s === 'ACCEPTED' || s === 'SUBMITTED' || s === 'SENT') return 'SUBMITTED'
  if (s === 'ARCHIVED') return 'CLOSED'
  return 'OPEN'
}

export function transformManifest(raw: PochtaRussiaBatch): Manifest {
  const batchName = raw['batch-name'] != null ? String(raw['batch-name']) : undefined
  const status = mapBatchStatus(raw['batch-status'])
  const count = raw['shipment-count'] != null ? Number(raw['shipment-count']) : undefined

  return {
    id: batchName,
    carrierId: 'pochta-russia',
    manifestNumber: batchName,
    status,
    labelCount: count,
    submittedAt:
      status === 'SUBMITTED' || status === 'CLOSED'
        ? toISODate(raw['send-date'] ?? raw['updated-on'])
        : undefined,
    createdAt: toISODate(raw['created-on'] ?? raw['send-date']),
    updatedAt: toISODate(raw['updated-on']),
    metadata: raw as Record<string, unknown>,
  }
}
