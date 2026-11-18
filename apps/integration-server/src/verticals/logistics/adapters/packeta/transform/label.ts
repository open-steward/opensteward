import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import { PacketaClient } from '../client'

/**
 * Parse a <packetLabelPdf> or <packetsLabelsPdf> XML response and return a Label.
 *
 * The response structure for a single label:
 *
 *   <packetLabelPdf>
 *     <status>ok</status>
 *     <result>JVBERi0xLjQKJ...</result>   <!-- base64-encoded PDF -->
 *   </packetLabelPdf>
 *
 * @param xml       Raw XML response from Packeta
 * @param barcode   Packet barcode the label was generated for
 * @param format    Label format string requested (e.g. "A7 on A4")
 * @param createdAt Optional creation timestamp
 */
export function parseLabelXml(
  xml: string,
  barcode: string,
  format: string,
  createdAt?: Date,
): Label {
  const base64 = PacketaClient.extract(xml, 'result') ?? undefined

  // Packeta always returns PDF labels
  const labelFormat = 'PDF' as const

  // Label URL: Packeta doesn't host labels — content is returned inline as base64
  return {
    id: barcode,
    shipmentId: barcode,
    trackingNumber: barcode,
    carrierId: 'packeta',
    format: labelFormat,
    status: 'CREATED',
    base64,
    createdAt: createdAt ?? toISODate(new Date().toISOString()),
    metadata: {
      requestedFormat: format,
      raw: xml,
    } as Record<string, unknown>,
  }
}
