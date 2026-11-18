import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * actaSIGN portfolio asset → canonical Document (metadata only — content REFUSED).
 *
 * Source: the actaSIGN OpenAPI 3.0.3 document served at
 * https://my.actasign.ch/api-docs/ (schema `TenantPortfolio.assets[]`),
 * returned by GET /v2/portfolios/{portfolioUid} "Retrieve a portfolio with its
 * assets". `downloadUrl` is never copied: the canonical Document has no
 * content or url field.
 */
export interface RawActasignAsset {
  assetUid?: string
  clientRef?: string | null
  context?: 'document' | 'attachment' | 'enclosure'
  filename?: string | null
  displayName?: string | null
  mediaType?: string | null
  size?: number | null
  numPages?: number | null
  numSignatures?: number | null
  downloadUrl?: string
}

/** `downloadUrl` is dropped from `raw` too, so no content link leaves the adapter. */
function withoutDownloadUrl(raw: RawActasignAsset): Omit<RawActasignAsset, 'downloadUrl'> {
  const { downloadUrl: _omit, ...rest } = raw
  return rest
}

export function transformDocument(
  raw: RawActasignAsset,
  requestUid: string,
  portfolioUid: string,
  order: number,
): Document {
  const assetUid = pickStr(raw.assetUid)
  if (!assetUid) throw new Error('actaSIGN portfolio asset is missing assetUid')
  const name = pickStr(raw.filename) ?? pickStr(raw.displayName)
  if (!name)
    throw new Error(`actaSIGN asset ${assetUid} has neither filename nor displayName to name it by`)
  return {
    id: `${requestUid}:${assetUid}`,
    externalId: assetUid,
    envelopeId: requestUid,
    name,
    sizeBytes: pickNum(raw.size),
    pageCount: pickNum(raw.numPages),
    mimeType: pickStr(raw.mediaType),
    order,
    platform: 'actasign',
    metadata: strMap({
      context: raw.context,
      displayName: raw.displayName,
      clientRef: raw.clientRef,
      numSignatures: raw.numSignatures,
      portfolioUid,
    }),
    raw: withoutDownloadUrl(raw),
  }
}
