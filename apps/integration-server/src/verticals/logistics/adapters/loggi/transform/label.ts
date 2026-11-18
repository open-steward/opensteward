import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * `v1CreateLabelResponse`, the 200 body of
 *   POST /v1/companies/{company_id}/labels
 * (https://docs.api.loggi.com/reference/criaretiqueta-1).
 *
 * "Os campos content e url são mutuamente exclusivos. O campo content será
 * retornado quando informado o valor LABEL_RESPONSE_TYPE_BASE_64 para o campo
 * responseType e o campo url será retornado quando informado o valor
 * LABEL_RESPONSE_TYPE_URL para o campo responseType."
 */
export interface LoggiLabelResponse {
  success?: {
    url?: string | null
    content?: string | null
    /** "Horário de geração da etiqueta em formato UTC." */
    createdTime?: string | null
  } | null
  failure?: Array<{
    loggiKey?: string | null
    status?: { code?: number | string | null; message?: string | null } | null
  }> | null
}

/** gRPC-style code the docs list for a failed key: "NOT_FOUND = 5". */
const NOT_FOUND = 5

/**
 * Map one label response for one Loggi key. The request names the key, so it
 * is the label id. Throws when Loggi reports the key under `failure` or
 * returns neither a url nor content.
 */
export function transformLabel(
  raw: LoggiLabelResponse,
  loggiKey: string,
  trackingNumber?: string,
): Label {
  const failed = (raw.failure ?? []).find((f) => f.loggiKey === loggiKey)
  const success = raw.success
  if (failed || (!success?.url && !success?.content)) {
    const code = failed?.status?.code != null ? Number(failed.status.code) : undefined
    const message = failed?.status?.message ?? 'no label returned'
    throw Object.assign(new Error(`Loggi label for ${loggiKey}: ${message}`), {
      statusCode: code === NOT_FOUND ? 404 : 502,
    })
  }

  return {
    id: loggiKey,
    trackingNumber,
    carrierId: 'loggi',
    // "Nesta versão é possível apenas gerar no formato PDF" (format enum: LABEL_FORMAT_PDF).
    format: 'PDF',
    status: 'CREATED',
    url: success.url ?? undefined,
    base64: success.content ?? undefined,
    createdAt: toISODate(success.createdTime),
    metadata: raw as Record<string, unknown>,
  }
}
