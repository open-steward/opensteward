import type { Label } from '../../../schema/label'
import { parcelStoryLabelUrl, type BoxberryParcelStoryItem } from './shipment'

/**
 * Raw label response from Boxberry getLabel / createOrder.
 *
 * createOrder returns `{ track, label }` where `label` is a URI to a PDF.
 * getLabel returns the URI string directly.
 */
export interface BoxberryLabelResponse {
  track?: string | null
  label?: string | null
  [key: string]: unknown
}

export function transformLabel(raw: BoxberryLabelResponse): Label {
  return {
    id: raw.track ?? undefined,
    shipmentId: raw.track ?? undefined,
    trackingNumber: raw.track ?? undefined,
    carrierId: 'boxberry',
    format: 'PDF',
    status: 'CREATED',
    url: raw.label ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a raw label URL string returned by getLabel(track).
 */
export function transformLabelUrl(url: string, trackingNumber?: string): Label {
  return {
    id: trackingNumber,
    shipmentId: trackingNumber,
    trackingNumber,
    carrierId: 'boxberry',
    format: 'PDF',
    status: 'CREATED',
    url: url || undefined,
    metadata: { label_url: url },
  }
}

/**
 * A `ParselStory` row as a Label: `label` is "Ссылка на скачивание pdf файла
 * с этикетками" for the parcel `track`. Rows without an absolute label URL are
 * not labels and are skipped by the caller.
 * https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
 */
export function transformParcelStoryLabel(raw: BoxberryParcelStoryItem): Label | undefined {
  const url = parcelStoryLabelUrl(raw.label)
  const track = raw.track || undefined
  if (!url || !track) return undefined
  return {
    id: track,
    shipmentId: track,
    trackingNumber: track,
    carrierId: 'boxberry',
    format: 'PDF',
    url,
    metadata: { ...raw },
  }
}
