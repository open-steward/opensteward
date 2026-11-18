import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'

/**
 * Raw shape returned by POST /embarcador/api/pedido/incluir
 * and GET /embarcador/api/pedido/consultar.
 *
 * Field names follow the Jadlog Embarcador API v2 specification.
 * All fields are optional because the API may omit absent values.
 */
export interface JadlogShipment {
  idpedido?: string | number | null
  nrpedido?: string | null
  codigo?: string | null          // Jadlog-generated shipment code
  cte?: string | null             // CT-e (transport document) number
  status?: string | null
  modalidade?: number | null
  tpentrega?: string | null
  cepori?: string | null
  cepdes?: string | null
  peso?: number | null             // kg
  vltotal?: number | null          // total freight value (BRL)
  nfdanfe?: string | null          // NF-e DANFE key
  nfnumero?: string | null         // NF number
  nfserie?: string | null
  vlnota?: number | null           // invoice / declared value (BRL)
  dtpedido?: string | null
  dtemissao?: string | null
  dtprevisao?: string | null       // estimated delivery date
  dtentrega?: string | null        // actual delivery date
  cnpjRemetente?: string | null
  nomeRemetente?: string | null
  enderecoRemetente?: string | null
  bairroRemetente?: string | null
  cidadeRemetente?: string | null
  ufRemetente?: string | null
  cepRemetente?: string | null
  cnpjDestinatario?: string | null
  nomeDestinatario?: string | null
  enderecoDestinatario?: string | null
  bairroDestinatario?: string | null
  cidadeDestinatario?: string | null
  ufDestinatario?: string | null
  cepDestinatario?: string | null
  urlRastreamento?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PE':   // Pedido Emitido
    case 'CR':   // Coletado
      return 'LABEL_CREATED'
    case 'EM':   // Em Trânsito
    case 'TR':
      return 'IN_TRANSIT'
    case 'SA':   // Saiu para Entrega
      return 'OUT_FOR_DELIVERY'
    case 'EN':   // Entregue
      return 'DELIVERED'
    case 'CA':   // Cancelado
      return 'CANCELLED'
    case 'EX':   // Exceção / Ocorrência
    case 'DE':   // Devolvido
      return 'EXCEPTION'
    case 'DV':   // Retorno ao Remetente
      return 'RETURNED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: JadlogShipment): Shipment {
  const id = raw.idpedido != null ? String(raw.idpedido) : (raw.codigo ?? undefined)

  return {
    id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.codigo ?? raw.cte ?? undefined,
    carrierId: 'jadlog',
    serviceCode: raw.modalidade != null ? String(raw.modalidade) : undefined,
    originAddress: raw.nomeRemetente || raw.cepRemetente
      ? {
          name: raw.nomeRemetente ?? undefined,
          street1: raw.enderecoRemetente ?? undefined,
          city: raw.cidadeRemetente ?? undefined,
          state: raw.ufRemetente ?? undefined,
          postalCode: raw.cepRemetente ?? undefined,
          country: 'BR',
        }
      : undefined,
    destinationAddress: raw.nomeDestinatario || raw.cepDestinatario
      ? {
          name: raw.nomeDestinatario ?? undefined,
          street1: raw.enderecoDestinatario ?? undefined,
          city: raw.cidadeDestinatario ?? undefined,
          state: raw.ufDestinatario ?? undefined,
          postalCode: raw.cepDestinatario ?? undefined,
          country: 'BR',
        }
      : undefined,
    totalWeight: raw.peso != null ? toWeight(raw.peso, 'kg') : undefined,
    cost: raw.vltotal != null
      ? { amount: parseDecimal(raw.vltotal) ?? 0, currency: 'BRL' }
      : undefined,
    reference: raw.nrpedido ?? undefined,
    estimatedDeliveryAt: toISODate(raw.dtprevisao),
    actualDeliveryAt: toISODate(raw.dtentrega),
    createdAt: toISODate(raw.dtpedido ?? raw.dtemissao),
    metadata: raw as Record<string, unknown>,
  }
}
