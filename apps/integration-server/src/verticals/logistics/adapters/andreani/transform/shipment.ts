import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Andreani raw types ────────────────────────────────────────────────────

export interface AndreaniShipment {
  numero_envio: string
  estado: string | null
  servicio: string | null
  label_url: string | null
  peso: number | null
  peso_unidad: string | null
  remitente: Record<string, unknown> | null
  destinatario: Record<string, unknown> | null
  referencia: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(estado: string | null): ShipmentStatus {
  switch (estado) {
    case 'PENDIENTE':         return 'PENDING'
    case 'EN_DISTRIBUCION':   return 'IN_TRANSIT'
    case 'EN_REPARTO':        return 'OUT_FOR_DELIVERY'
    case 'ENTREGADO':         return 'DELIVERED'
    case 'NO_ENTREGADO':      return 'EXCEPTION'
    case 'DEVUELTO':          return 'RETURNED'
    case 'CANCELADO':         return 'CANCELLED'
    default:                  return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: AndreaniShipment): Shipment {
  const weightUnit = (raw.peso_unidad?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.numero_envio,
    status: mapShipmentStatus(raw.estado),
    trackingNumber: raw.numero_envio ?? undefined,
    carrierId: 'andreani',
    serviceCode: raw.servicio ?? undefined,
    originAddress: toAddress(raw.remitente),
    destinationAddress: toAddress(raw.destinatario),
    totalWeight: raw.peso != null ? toWeight(raw.peso, weightUnit) : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.referencia ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
