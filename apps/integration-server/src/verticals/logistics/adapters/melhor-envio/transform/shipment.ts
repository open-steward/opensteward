import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Melhor Envio raw types ───────────────────────────────────────────────────

export interface MelhorEnvioShipment {
  id?: string | number | null
  protocol?: string | null
  status?: string | null
  tracking?: string | null
  service_id?: number | null
  service_code?: string | null
  service_name?: string | null
  company?: {
    id?: number | null
    name?: string | null
    [key: string]: unknown
  } | null
  from?: Record<string, unknown> | null
  to?: Record<string, unknown> | null
  volumes?: Array<{
    id?: string | null
    height?: number | null
    width?: number | null
    length?: number | null
    diameter?: number | null
    weight?: number | null
    format?: string | null
    [key: string]: unknown
  }> | null
  price?: number | string | null
  discount?: number | string | null
  delivery_min?: number | null
  delivery_max?: number | null
  self_tracking?: string | null
  url?: string | null
  label?: {
    url?: string | null
    [key: string]: unknown
  } | null
  created_at?: string | null
  updated_at?: string | null
  paid_at?: string | null
  generated_at?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const v = status.toUpperCase()
  // Melhor Envio status values (Portuguese and English forms)
  if (v === 'PENDING' || v === 'PENDING_PAYMENT' || v === 'AGUARDANDO_PAGAMENTO') return 'PENDING'
  if (
    v === 'LABEL_CREATED' ||
    v === 'GENERATED' ||
    v === 'GERADO' ||
    v === 'PAID' ||
    v === 'PAGO' ||
    v === 'POSTED' ||
    v === 'POSTADO' ||
    v === 'RELEASED' ||
    v === 'LIBERADO'
  )
    return 'LABEL_CREATED'
  if (v === 'IN_TRANSIT' || v === 'EM_TRANSITO' || v.includes('TRANSIT')) return 'IN_TRANSIT'
  if (v === 'OUT_FOR_DELIVERY' || v === 'SAIU_PARA_ENTREGA' || v.includes('OUT_FOR_DELIVERY'))
    return 'OUT_FOR_DELIVERY'
  if (v === 'DELIVERED' || v === 'ENTREGUE') return 'DELIVERED'
  if (
    v === 'EXCEPTION' ||
    v === 'PROBLEMA' ||
    v === 'FAILED' ||
    v.includes('FAIL') ||
    v.includes('ERROR') ||
    v === 'CANCELADO' ||
    v === 'CANCEL'
  )
    return 'EXCEPTION'
  if (v === 'RETURNED' || v === 'DEVOLVIDO' || v.includes('RETURN')) return 'RETURNED'
  if (v === 'CANCELLED' || v === 'CANCELED' || v === 'CANCELADO') return 'CANCELLED'
  return 'UNKNOWN'
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformShipment(raw: MelhorEnvioShipment): Shipment {
  const id = raw.id != null ? String(raw.id) : undefined
  const labelUrl = raw.label?.url ?? raw.url ?? undefined

  // Aggregate weight from volumes array if present
  const totalWeightKg =
    raw.volumes && raw.volumes.length > 0
      ? raw.volumes.reduce((acc, v) => acc + (v.weight ?? 0), 0)
      : undefined

  return {
    id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking ?? raw.self_tracking ?? undefined,
    carrierId: raw.company?.name
      ? String(raw.company.name).toLowerCase().replace(/\s+/g, '-')
      : 'melhor-envio',
    serviceCode: raw.service_code ?? (raw.service_id != null ? String(raw.service_id) : undefined),
    originAddress: toAddress(raw.from ?? null),
    destinationAddress: toAddress(raw.to ?? null),
    totalWeight: totalWeightKg != null ? toWeight(totalWeightKg, 'kg') : undefined,
    labelUrl: labelUrl != null ? String(labelUrl) : undefined,
    reference: raw.protocol ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
