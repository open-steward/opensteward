import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Label, LabelStatus } from '../../../schema/label'
import type { Package } from '../../../schema/shared'

/**
 * Records of Frenet's WhiteLabel Shipments and Orders Integration APIs
 * (https://docs.frenet.com.br/reference/getshipmentsasync and siblings).
 *
 * Field names follow the documented example responses, which are camelCase
 * (`"shipmentId": 12679, "orderId": "ORD-1003", "shipmentStatus":
 * "CancelamentoAgendado"`). The component schemas beside them spell the same
 * properties in PascalCase (`ShipmentId`, `OrderId`, `ShipmentStatus`); the
 * examples are what the wire shows, so they are what is read. Only fields the
 * definitions document are declared.
 */
export interface FrenetWhitelabelQuotation {
  /** "Nome da transportadora responsável pela entrega do pedido" */
  carrier?: string | null
  /** "Código da transportadora responsável pela entrega do pedido" */
  carrierCode?: string | null
  /** "Código do serviço de cotação escolhido no pedido" (example: 3298) */
  shippingServiceCode?: string | number | null
  shippingServiceName?: string | null
}

export interface FrenetWhitelabelVolume {
  /** "Id interno do volume controlado pela Frenet" (example: "65338") */
  volumeId?: string | number | null
  /** "Id da etiqueta vinculada ao item do pedido" */
  labelId?: string | null
  /** "Peso do volume em kilos" */
  weight?: number | null
  /** "Comprimento do volume (em cm)" */
  length?: number | null
  /** "Altura do volume (em cm)" */
  height?: number | null
  /** "Largura do volume (em cm)" */
  width?: number | null
}

/**
 * `ShipmentStatus`: "enum: 1 - Criado, 2 - PendentePagamento, 3 - FalhaPagamento,
 * 4 - SucessoPagamento, 5 - Postado, 6 - CancelamentoAgendado, 7 - Cancelado,
 * 9 - Excluído, 18 - Entregue no ponto de postagem". The schema types it as an
 * integer; the examples send the name (`"shipmentStatus": "SucessoPagamento"`).
 * Both spellings of the one documented value are understood.
 */
export type FrenetShipmentStatus = number | string

/** `ShipmentResponse` (GET /shipments, /shipments/{id}, /orders, /orders/{id}). */
export interface FrenetWhitelabelShipment {
  /** "Código interno do envio na Frenet" */
  shipmentId?: number | string | null
  /** "Código do pedido na Plataforma" */
  orderId?: string | null
  shipmentStatus?: FrenetShipmentStatus | null
  /** "URL para rastreio do envio" */
  trackingUrl?: string | null
  /** "URL para impressão da etiqueta do envio" */
  labelUrl?: string | null
  quotation?: FrenetWhitelabelQuotation | null
  /** "Volumes do envio" */
  volumes?: FrenetWhitelabelVolume[] | null
  [key: string]: unknown
}

/** `ShipmentsResponse`: `Total` ("Total de envios") and the page's `Shipments`. */
export interface FrenetWhitelabelPage {
  total?: number | null
  shipments?: FrenetWhitelabelShipment[] | null
}

/** `ShipmentResult` (GET /shipments/{shipmentId}/label). */
export interface FrenetWhitelabelLabel {
  shipmentId?: number | string | null
  orderId?: string | null
  shipmentStatus?: FrenetShipmentStatus | null
  trackingUrl?: string | null
  labelUrl?: string | null
  [key: string]: unknown
}

const STATUS_NAMES: Record<string, number> = {
  criado: 1,
  pendentepagamento: 2,
  falhapagamento: 3,
  sucessopagamento: 4,
  postado: 5,
  cancelamentoagendado: 6,
  cancelado: 7,
  excluído: 9,
  excluido: 9,
}

/** The documented status code, from either documented spelling. */
export function statusCode(raw: FrenetShipmentStatus | null | undefined): number | undefined {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : undefined
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return STATUS_NAMES[trimmed.toLowerCase()]
}

function mapShipmentStatus(code: number | undefined): ShipmentStatus {
  switch (code) {
    case 1: // Criado
    case 2: // PendentePagamento
    case 3: // FalhaPagamento: label not paid for yet, nothing has moved
      return 'PENDING'
    case 4: // SucessoPagamento: paid, label released for printing
    case 18: // Entregue no ponto de postagem: dropped off, awaiting collection
      return 'LABEL_CREATED'
    case 5: // Postado
      return 'IN_TRANSIT'
    case 6: // CancelamentoAgendado
    case 7: // Cancelado
    case 9: // Excluído
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function mapOrderStatus(code: number | undefined): OrderStatus {
  switch (code) {
    case 1:
    case 2:
      return 'PENDING'
    case 3:
      return 'ON_HOLD'
    case 4:
    case 18:
      return 'AWAITING_SHIPMENT'
    case 5:
      return 'SHIPPED'
    case 6:
    case 7:
    case 9:
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

function mapLabelStatus(code: number | undefined): LabelStatus {
  switch (code) {
    case 4:
    case 18:
      return 'CREATED'
    case 5:
      return 'USED'
    case 6:
    case 7:
    case 9:
      return 'VOIDED'
    default:
      return 'unknown'
  }
}

/** A documented id, or a throw: a row without one cannot be read back. */
function requireShipmentId(raw: { shipmentId?: number | string | null }, what: string): string {
  const id = raw.shipmentId
  if (
    (typeof id === 'number' && Number.isFinite(id)) ||
    (typeof id === 'string' && id.trim() !== '')
  ) {
    return String(id).trim()
  }
  throw new Error(`Frenet ${what} has no shipmentId`)
}

/** Only an absolute http(s) URL; the examples send "" before a label exists. */
function absoluteUrl(val: string | null | undefined): string | undefined {
  if (typeof val !== 'string' || val.trim() === '') return undefined
  try {
    const u = new URL(val.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined
  } catch {
    return undefined
  }
}

function num(val: unknown): number | undefined {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : undefined
}

function text(val: unknown): string | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return String(val)
  return typeof val === 'string' && val.trim() !== '' ? val.trim() : undefined
}

function transformVolume(v: FrenetWhitelabelVolume): Package {
  const weight = num(v.weight)
  const length = num(v.length)
  const width = num(v.width)
  const height = num(v.height)
  return {
    id: text(v.volumeId),
    weight: weight !== undefined ? { value: weight, unit: 'kg' } : undefined,
    dimensions:
      length !== undefined && width !== undefined && height !== undefined
        ? { length, width, height, unit: 'cm' }
        : undefined,
  }
}

/**
 * A `ShipmentResponse` as a canonical Shipment. Cost is left out: the
 * definition gives `ShippingPrice` ("Valor do frete calculado para o pedido considerando o
 * contrato Frenet") without a currency.
 */
export function transformWhitelabelShipment(raw: FrenetWhitelabelShipment): Shipment {
  const volumes = Array.isArray(raw.volumes) ? raw.volumes : []
  return {
    id: requireShipmentId(raw, 'shipment'),
    status: mapShipmentStatus(statusCode(raw.shipmentStatus)),
    carrierId: text(raw.quotation?.carrierCode),
    serviceCode: text(raw.quotation?.shippingServiceCode),
    labelUrl: absoluteUrl(raw.labelUrl),
    packages: volumes.length > 0 ? volumes.map(transformVolume) : undefined,
    reference: text(raw.orderId),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * A record of the Orders Integration API (`GET /orders` answers the same
 * `ShipmentsResponse`) as a canonical Order. Its id is the `shipmentId` that
 * `GET /orders/{shipmentId}` takes; `orderId` is the platform's order code.
 */
export function transformWhitelabelOrder(raw: FrenetWhitelabelShipment): Order {
  return {
    id: requireShipmentId(raw, 'order'),
    status: mapOrderStatus(statusCode(raw.shipmentStatus)),
    orderNumber: text(raw.orderId),
    requestedServiceCode: text(raw.quotation?.shippingServiceCode),
    metadata: raw as Record<string, unknown>,
  }
}

/** A `ShipmentResult` (GET /shipments/{shipmentId}/label) as a canonical Label. */
export function transformWhitelabelLabel(raw: FrenetWhitelabelLabel): Label {
  const id = requireShipmentId(raw, 'label')
  return {
    id,
    shipmentId: id,
    status: mapLabelStatus(statusCode(raw.shipmentStatus)),
    url: absoluteUrl(raw.labelUrl),
    metadata: raw as Record<string, unknown>,
  }
}
