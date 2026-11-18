/**
 * Transform NextBillion.ai Route Optimization job → canonical Order.
 *
 * The Route Optimization API (POST /optimization/v2) accepts "jobs" (single
 * pickup or delivery) and "shipments" (paired pickup+delivery). Both map to the
 * canonical Order type.
 */
import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

/** A single job in an optimization task. */
export interface NBOptJob {
  id?: number | string | null
  description?: string | null
  location_index?: number | null
  service?: number | null           // seconds
  time_windows?: [number, number][] | null
  priority?: number | null
  [key: string]: unknown
}

/** A shipment (pickup+delivery pair) in an optimization task. */
export interface NBOptShipment {
  pickup?: NBOptJobStep | null
  delivery?: NBOptJobStep | null
  amount?: number[] | null
  priority?: number | null
  [key: string]: unknown
}

export interface NBOptJobStep {
  id?: number | string | null
  description?: string | null
  location_index?: number | null
  service?: number | null
  time_windows?: [number, number][] | null
  [key: string]: unknown
}

/** Top-level optimization task result. */
export interface NBOptTask {
  id?: string | null
  status?: string | null   // 'Ok' | 'Error'
  result?: NBOptResult | null
  [key: string]: unknown
}

export interface NBOptResult {
  code?: number | null
  summary?: {
    cost?: number | null
    unassigned?: number | null
    delivery?: number[] | null
    pickup?: number[] | null
    service?: number | null
    duration?: number | null
    waiting_time?: number | null
    distance?: number | null
    [key: string]: unknown
  } | null
  routes?: NBOptRoute[] | null
  unassigned?: unknown[] | null
  [key: string]: unknown
}

export interface NBOptRoute {
  vehicle?: number | null
  cost?: number | null
  delivery?: number[] | null
  pickup?: number[] | null
  service?: number | null
  duration?: number | null
  waiting_time?: number | null
  distance?: number | null
  steps?: NBOptStep[] | null
  [key: string]: unknown
}

export interface NBOptStep {
  type?: string | null       // 'start' | 'job' | 'pickup' | 'delivery' | 'end'
  id?: number | string | null
  arrival?: number | null    // Unix timestamp
  duration?: number | null
  service?: number | null
  job?: number | null
  [key: string]: unknown
}

function mapOptStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'ok':         return 'AWAITING_SHIPMENT'
    case 'error':      return 'CANCELLED'
    default:           return 'PENDING'
  }
}

export function transformOptTask(raw: NBOptTask): Order {
  const result = raw.result
  const summary = result?.summary
  const routes = result?.routes ?? []
  const unassigned = result?.unassigned ?? []

  const status: OrderStatus = unassigned.length > 0
    ? 'PROCESSING'
    : mapOptStatus(raw.status)

  // Collect shipment IDs from routes (vehicle IDs as string IDs)
  const shipmentIds = routes
    .map((r) => (r.vehicle !== null && r.vehicle !== undefined ? String(r.vehicle) : undefined))
    .filter((v): v is string => v !== undefined)

  return {
    id: raw.id ?? undefined,
    status,
    orderNumber: raw.id ?? undefined,
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    totalAmount: summary?.cost ?? undefined,
    notes: summary
      ? `distance=${summary.distance ?? 0}m duration=${summary.duration ?? 0}s`
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformOptJob(raw: NBOptJob): Order {
  const arrivals = (raw.time_windows ?? [])
  const earliest = arrivals[0]

  return {
    id: String(raw.id ?? ''),
    status: 'PENDING',
    orderNumber: String(raw.id ?? ''),
    notes: raw.description ?? undefined,
    orderAt: earliest ? toISODate(earliest[0] * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
