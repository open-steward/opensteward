import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

/**
 * Boxberry manifest (transfer act / акт приема-передачи).
 *
 * Two API methods are used:
 *   - GET  ParselSend?ImIds=<csv>  — creates a transfer act and returns:
 *     { id: <act_number>, label: <URI>, sticker: <URI> }
 *   - GET  ParselSendStory[?from=YYYYMMDD&to=YYYYMMDD]  — lists created acts:
 *     [ { track: '<csv of tracking codes>', label: '<URI>', date: 'YYYY.MM.DD HH:MM:SS' }, … ]
 *
 * Reference (official Boxberry knowledge-base, via SDK README):
 *   https://github.com/iamwildtuna/boxberry-sdk (README § createOrdersTransferAct / getActsList)
 */

// ─── Raw API response types ───────────────────────────────────────────────────

/** Response from ParselSend (act creation). */
export interface BoxberryParselSendResponse {
  /** Transfer-act ID number (e.g. "12345"). */
  id?: string | number | null
  /** URI to download the act PDF. */
  label?: string | null
  /** URI to download the label sticker sheet. */
  sticker?: string | null
  [key: string]: unknown
}

/**
 * Single item from ParselSendStory (act list).
 *
 * `track` is a comma-separated string of tracking codes in the act.
 * `date` is formatted "YYYY.MM.DD HH:MM:SS".
 */
export interface BoxberryParselSendStoryItem {
  track?: string | null
  label?: string | null
  date?: string | null
  [key: string]: unknown
}

// ─── Transform functions ──────────────────────────────────────────────────────

/**
 * Transform a ParselSend response (act creation) into a canonical Manifest.
 * ParselSend returns { id, label, sticker } — the list of tracking IDs must be
 * supplied by the caller from the original request payload.
 */
export function transformManifestFromCreate(
  raw: BoxberryParselSendResponse,
  shipmentIds?: string[],
): Manifest {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    carrierId: 'boxberry',
    status: 'SUBMITTED',
    shipmentIds,
    labelCount: shipmentIds?.length,
    submittedAt: new Date(),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a single ParselSendStory list item into a canonical Manifest.
 */
export function transformManifest(raw: BoxberryParselSendStoryItem): Manifest {
  const shipmentIds = raw.track
    ? raw.track.split(',').map((t) => t.trim()).filter(Boolean)
    : undefined

  // `date` is "YYYY.MM.DD HH:MM:SS" — replace dots in date part for ISO parse.
  const normalizedDate = raw.date
    ? raw.date.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3')
    : undefined

  return {
    carrierId: 'boxberry',
    status: 'SUBMITTED',
    shipmentIds,
    labelCount: shipmentIds?.length,
    submittedAt: toISODate(normalizedDate),
    createdAt: toISODate(normalizedDate),
    metadata: raw as Record<string, unknown>,
  }
}
