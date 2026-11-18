import type { Pickup, PickupStatus } from '../../../schema/pickup'
import { nonempty, parseDecimal, toISODate } from '../../shared/transform'
import { transformAddress, type EasyPostAddress } from './address'

/** Carrier error attached to a Pickup while its rates were being generated. */
export interface EasyPostMessage {
  carrier?: string | null
  type?: string | null
  message?: string | null
  carrier_account_id?: string | null
  [key: string]: unknown
}

export interface EasyPostPickupRate {
  id: string
  object: 'PickupRate'
  mode: string
  carrier: string
  service: string
  rate: string // decimal string, e.g. "0.00"
  currency: string
  pickup_id: string
  created_at: string
  updated_at: string
  [key: string]: unknown
}

/**
 * `shipment` is documented as the associated Shipment and `batch` is the
 * create-time alternative to it; the docs' example responses show neither,
 * so both are optional and read defensively. Only the ids are needed here.
 */
export interface EasyPostPickup {
  id: string
  object: 'Pickup'
  reference: string | null
  mode: string
  status: string // "scheduled" | "canceled" | "unknown"
  min_datetime: string | null
  max_datetime: string | null
  is_account_address: boolean | null
  instructions: string | null
  messages: EasyPostMessage[]
  confirmation: string | null // carrier confirmation, set once bought
  address: EasyPostAddress | null
  shipment?: { id: string; [key: string]: unknown } | null
  batch?: { id: string; shipments?: { id: string }[] | null; [key: string]: unknown } | null
  carrier_accounts: { id: string; [key: string]: unknown }[]
  pickup_rates: EasyPostPickupRate[]
  created_at: string
  updated_at: string
  [key: string]: unknown
}

function mapPickupStatus(status: string): PickupStatus {
  switch (status) {
    case 'scheduled':
      return 'SCHEDULED'
    case 'canceled':
      return 'CANCELLED'
    // EasyPost's "unknown" is the state between create and buy — quoted, not
    // yet booked — so it is PENDING, not a value this map failed to recognise.
    case 'unknown':
      return 'PENDING'
    default:
      return 'unknown'
  }
}

/**
 * The rate `createPickup` buys: lowest `rate` across the quotes, first one on
 * a tie (EasyPost's own order). The buy endpoint takes `carrier` + `service`
 * rather than a rate id, so the whole entry comes back. A quote whose amount
 * does not parse cannot be ranked and is skipped.
 */
export function cheapestPickupRate(
  rates: EasyPostPickupRate[] | null | undefined,
): EasyPostPickupRate | undefined {
  if (!rates) return undefined
  let best: EasyPostPickupRate | undefined
  let bestAmount = Infinity
  for (const rate of rates) {
    const amount = parseDecimal(rate.rate)
    if (amount !== undefined && amount < bestAmount) {
      best = rate
      bestAmount = amount
    }
  }
  return best
}

/**
 * A bought Pickup carries no `selected_rate`; the only carrier signal on the
 * record is the set of carriers that quoted it. When exactly one did — a
 * `carrier_accounts` filter or a single-carrier account, the common case —
 * that is the carrier. With several, the booked one is not knowable from the
 * record and the field stays undefined rather than guessed. The name, not
 * the account id, to match `Shipment.carrierId` and `Rate.carrierId` here.
 */
function soleCarrier(rates: EasyPostPickupRate[] | null | undefined): string | undefined {
  if (!rates) return undefined
  const carriers = new Set(rates.map((r) => r.carrier).filter((c) => !!c))
  return carriers.size === 1 ? [...carriers][0] : undefined
}

/** Shipment ids the pickup covers: the one shipment, or every shipment of the batch. */
function coveredShipmentIds(raw: EasyPostPickup): string[] | undefined {
  if (raw.shipment?.id) return [raw.shipment.id]
  const batched = raw.batch?.shipments?.map((s) => s.id)
  return nonempty(batched?.filter((id) => !!id))
}

export function transformPickup(raw: EasyPostPickup): Pickup {
  return {
    id: raw.id,
    confirmationNumber: raw.confirmation ?? undefined,
    carrierId: soleCarrier(raw.pickup_rates),
    status: mapPickupStatus(raw.status),
    address: raw.address ? transformAddress(raw.address) : undefined,
    readyAt: toISODate(raw.min_datetime),
    closeAt: toISODate(raw.max_datetime),
    shipmentIds: coveredShipmentIds(raw),
    instructions: raw.instructions ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
