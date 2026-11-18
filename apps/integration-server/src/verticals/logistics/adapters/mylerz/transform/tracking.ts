import type { TrackingEvent } from '../../../schema/trackingevent'

/**
 * One `PackageStatusLog` entry from
 * GET api/packages/GetPackageTrackingDetailsByBarCode?barcode={barcode}
 * (https://integration.mylerz.net/Help/Api/GET-api-packages-GetPackageTrackingDetailsByBarCode_barcode):
 * StatusId, StatusArName, StatusEnName, StatusBusId, StatusBusArName,
 * StatusBusEnName, StatusColor, PackageId, ChangedDate, smsList, CallList,
 * collapse.
 */
export interface MylerzStatusLogRaw {
  StatusId?: number | null
  StatusArName?: string | null
  StatusEnName?: string | null
  StatusBusId?: number | null
  StatusBusArName?: string | null
  StatusBusEnName?: string | null
  StatusColor?: string | null
  PackageId?: number | null
  ChangedDate?: string | null
  [key: string]: unknown
}

/** `TrackingDTO`: PackageListTracking, PackageTrackingShipmentDetails, PackageStatusLog. */
export interface MylerzTrackingValue {
  PackageListTracking?: {
    PackageId?: number | null
    Barcode?: string | null
    [key: string]: unknown
  } | null
  PackageTrackingShipmentDetails?: Record<string, unknown> | null
  PackageStatusLog?: MylerzStatusLogRaw[] | null
}

function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/**
 * The package's status log as tracking events. Mylerz documents no list of
 * status names, so `status` stays UNKNOWN and the English name is the
 * description. The id is built from documented fields: the barcode, the
 * status and when it changed. Mylerz documents no per-entry id and no
 * nullability, so when two entries build the same key (for example the same
 * StatusId with no ChangedDate) the later ones take a `#2`, `#3`... suffix in
 * log order, which keeps the ids distinct and stable for the same log.
 */
export function transformTracking(value: MylerzTrackingValue, barcode: string): TrackingEvent[] {
  const seen = new Map<string, number>()
  return (value.PackageStatusLog ?? [])
    .map((log) => {
      const key = `${barcode}:${log.StatusId ?? ''}:${log.ChangedDate ?? ''}`
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      return { log, id: n === 1 ? key : `${key}#${n}` }
    })
    .map(({ log, id }) => ({
      id,
      trackingNumber: barcode,
      carrierId: 'mylerz',
      status: 'UNKNOWN' as const,
      description: log.StatusEnName ?? undefined,
      occurredAt: toDate(log.ChangedDate),
      metadata: log as Record<string, unknown>,
    }))
}
