/**
 * Andreani REST API v2 — ordenes-de-envio response → canonical Order.
 *
 * GET /v2/ordenes-de-envio/{numeroAndreani} returns an Orden object.
 * POST /v2/ordenes-de-envio creates an order and returns the same shape.
 *
 * Docs: https://developers.andreani.com/documentacion
 * Source reference: https://github.com/nchsala/andreani (src/models/ordenes.model.ts)
 */
import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

// ─── Andreani raw types ────────────────────────────────────────────────────

export interface AndreaniSucursalRef {
  id?: string | null
  nomenclatura?: string | null
  descripcion?: string | null
  [key: string]: unknown
}

export interface AndreaniOrdenBulto {
  numeroBulto?: string | null
  numeroEnvio?: string | null
  etiqueta?: string | null
  [key: string]: unknown
}

export interface AndreaniOrden {
  estado?: string | null
  tipo?: string | null
  sucursalDeDistribucion?: AndreaniSucursalRef | null
  sucursalDeRendicion?: AndreaniSucursalRef | null
  sucursalDeImposicion?: AndreaniSucursalRef | null
  fechaCreacion?: string | null
  fechaEstimadaDeEntrega?: string | null
  zonaDeReparto?: string | null
  numeroDePermisionaria?: string | null
  descripcionServicio?: string | null
  etiquetaRemito?: string | null
  etiquetaAgrupador?: string | null
  bultos?: AndreaniOrdenBulto[] | null
  contrato?: string | null
  canal?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapOrderStatus(estado: string | null | undefined): OrderStatus {
  switch (estado?.toUpperCase()) {
    case 'PENDIENTE':
    case 'CREADA':
      return 'PENDING'
    case 'EN_PROCESO':
    case 'PROCESANDO':
      return 'PROCESSING'
    case 'EN_DISTRIBUCION':
    case 'EN_REPARTO':
      return 'SHIPPED'
    case 'ENTREGADO':
      return 'DELIVERED'
    case 'CANCELADO':
    case 'ANULADO':
      return 'CANCELLED'
    case 'DEVUELTO':
      return 'RETURNED'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: AndreaniOrden): Order {
  const firstBulto = raw.bultos?.[0]
  const shipmentIds = raw.bultos
    ?.map((b) => b.numeroEnvio ?? b.numeroBulto)
    .filter((id): id is string => !!id)

  return {
    id: firstBulto?.numeroEnvio ?? firstBulto?.numeroBulto ?? undefined,
    status: mapOrderStatus(raw.estado),
    requestedServiceCode: raw.descripcionServicio ?? undefined,
    shipmentIds: shipmentIds && shipmentIds.length > 0 ? shipmentIds : undefined,
    notes: raw.zonaDeReparto ?? undefined,
    orderAt: toISODate(raw.fechaCreacion),
    shippedAt: undefined,
    deliveredAt: undefined,
    createdAt: toISODate(raw.fechaCreacion),
    metadata: raw as Record<string, unknown>,
  }
}
