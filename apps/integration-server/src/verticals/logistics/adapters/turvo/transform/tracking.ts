import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface TurvoTrackingEvent {
  id?: string
  status?: string
  description?: string
  city?: string
  state?: string
  country?: string
  occurredAt?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, TrackingEventStatus> = {
  created: 'PRE_TRANSIT',
  picked_up: 'IN_TRANSIT',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  exception: 'FAILURE',
  cancelled: 'FAILURE',
}

export function transformTrackingEvent(raw: TurvoTrackingEvent): TrackingEvent {
  const location: Address | undefined =
    raw.city || raw.state || raw.country
      ? {
          city: raw.city,
          state: raw.state,
          country: raw.country as Address['country'],
        }
      : undefined

  return {
    id: raw.id,
    status: raw.status ? (STATUS_MAP[raw.status] ?? 'UNKNOWN') : undefined,
    description: raw.description,
    location,
    occurredAt: toISODate(raw.occurredAt),
  }
}
