import type { Label } from '../../../schema/label'

/**
 * One item of the `POST /rest-api/orders/documents` ("Get shipping labels
 * (PDF)") 200 body, which the spec embedded in
 * https://api.sendparcel.com/rest-api/doc types as `"type":"array"` of
 * `{file_name: "File name", ftype: "File format", file_data: "File data format: base64"}`.
 */
export interface SendParcelOrderDocument {
  file_name?: string
  ftype?: string
  file_data?: string
}

/**
 * The document is fetched by order id, and that is the only key that reads it
 * back, so it becomes the label id. `ftype` values are not enumerated in the
 * spec; only "pdf" (the format the operation's summary names) is mapped.
 */
export function transformOrderDocument(orderId: string, raw: SendParcelOrderDocument): Label {
  return {
    id: orderId,
    format: raw.ftype?.toLowerCase() === 'pdf' ? 'PDF' : undefined,
    base64: raw.file_data || undefined,
    metadata: { orderId, file_name: raw.file_name, ftype: raw.ftype },
  }
}
