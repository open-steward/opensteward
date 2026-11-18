import type { TrackingEvent } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

/**
 * Tracking payloads as the first-party portal documents them
 * (https://urgentcargus.developer.azure-api.net/api-details#api=55acb9ae5f80b911a8f59a5f).
 *
 * `NoAuth_GetAwbTrace` ("Gets Awb trace by barcode without authentication"),
 * `GET /api/NoAuth/GetAwbTrace?barCode={barCode}`, returns packages:
 *
 *   [{"Code":"string","Type":"string","MeasuredWeight":0,"VolumetricWeight":0,
 *     "ConfirmationName":"string","Observation":"string","ResponseCode":"string",
 *     "OrderStatus":0,"OrderLate":true,
 *     "Event":[{"Date":"string","EventId":0,"Description":"string","LocalityName":"string"}]}]
 *
 * `AwbTrace_GetDeltaEvents` ("Get an array of events for packages by date"),
 * `GET /api/AwbTrace/GetDeltaEvents?FromDate={FromDate}&ToDate={ToDate}`,
 * returns AWBs with their packages' events:
 *
 *   [{"Date":"string","BarCode":"string", ... ,
 *     "Packages":[{"Code":"string","CodeNT":"string","Type":"string", ... ,
 *       "Events":[{"Date":"string","EventId":0,"Description":"string",
 *                  "LocalityName":"string","CountyName":"string"}]}]}]
 *
 * Neither documents the values of `EventId` or the format of `Date`, so the
 * canonical status is UNKNOWN and `occurredAt` is set only when `Date` parses.
 * An event's id joins the AWB barcode, the package code, the event id and the
 * event date: all documented fields.
 */
export interface CargusTraceEvent {
  Date?: string | null
  EventId?: number | null
  Description?: string | null
  LocalityName?: string | null
  CountyName?: string | null
}

export interface CargusTracePackage {
  Code?: string | null
  Event?: CargusTraceEvent[] | null
  [key: string]: unknown
}

export interface CargusDeltaPackage {
  Code?: string | null
  Events?: CargusTraceEvent[] | null
  [key: string]: unknown
}

export interface CargusDeltaAwb {
  BarCode?: string | null
  Packages?: CargusDeltaPackage[] | null
  [key: string]: unknown
}

function toEvent(
  barCode: string,
  packageCode: string | null | undefined,
  ev: CargusTraceEvent,
): TrackingEvent {
  const location =
    ev.LocalityName || ev.CountyName
      ? { city: ev.LocalityName || undefined, state: ev.CountyName || undefined }
      : undefined
  return {
    id: [barCode, packageCode ?? '', ev.EventId ?? '', ev.Date ?? ''].join(':'),
    shipmentId: barCode,
    trackingNumber: barCode,
    carrierId: 'cargus',
    status: 'UNKNOWN',
    description: ev.Description || undefined,
    location,
    occurredAt: toISODate(ev.Date),
    metadata: { ...ev, BarCode: barCode, PackageCode: packageCode ?? undefined },
  }
}

/** Events of one AWB from `NoAuth_GetAwbTrace`, for the barcode that was asked for. */
export function transformAwbTrace(
  packages: CargusTracePackage[],
  barCode: string,
): TrackingEvent[] {
  return packages.flatMap((p) => (p.Event ?? []).map((ev) => toEvent(barCode, p.Code, ev)))
}

/** Events of every AWB in one `AwbTrace_GetDeltaEvents` response, in response order. */
export function transformDeltaEvents(awbs: CargusDeltaAwb[]): TrackingEvent[] {
  return awbs.flatMap((awb) => {
    if (!awb.BarCode) throw new Error('Cargus delta event AWB without a BarCode')
    const barCode = awb.BarCode
    return (awb.Packages ?? []).flatMap((p) =>
      (p.Events ?? []).map((ev) => toEvent(barCode, p.Code, ev)),
    )
  })
}
