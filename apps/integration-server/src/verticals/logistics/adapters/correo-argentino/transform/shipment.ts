import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Correo Argentino raw types ───────────────────────────────────────────

export interface CorreoArgentinoEnvio {
  envio_id: string
  tracking_number: string
  estado: string | null
  label_url: string | null
  servicio: string | null
  peso: number | null
  peso_unidad: string | null
  remitente: Record<string, unknown> | null
  destinatario: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapShipmentStatus(estado: string | null): ShipmentStatus {
  switch (estado) {
    case 'IMPUESTO':          return 'PENDING'
    case 'EN_TRANSITO':       return 'IN_TRANSIT'
    case 'EN_DISTRIBUCION':   return 'OUT_FOR_DELIVERY'
    case 'ENTREGADO':         return 'DELIVERED'
    case 'NO_ENTREGADO':      return 'EXCEPTION'
    case 'DEVUELTO':          return 'RETURNED'
    case 'CANCELADO':         return 'CANCELLED'
    default:                  return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformShipment(raw: CorreoArgentinoEnvio): Shipment {
  const weightUnit = (raw.peso_unidad?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.envio_id,
    status: mapShipmentStatus(raw.estado),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'correo-argentino',
    serviceCode: raw.servicio ?? undefined,
    originAddress: toAddress(raw.remitente),
    destinationAddress: toAddress(raw.destinatario),
    totalWeight: raw.peso != null ? toWeight(raw.peso, weightUnit) : undefined,
    labelUrl: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
