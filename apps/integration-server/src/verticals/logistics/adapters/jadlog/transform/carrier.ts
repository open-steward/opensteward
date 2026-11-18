import type { Carrier } from '../../../schema/carrier'
import { JADLOG_MODALITY } from '../constants'

// ─── Jadlog carrier (derived / static) ──────────────────────────────────────
//
// Jadlog does not expose a "list carriers" REST endpoint — it is itself a
// single carrier (a DPD Brazil affiliate). The carrier record is derived from
// the publicly documented service modality codes defined in constants.ts.
//
// Source: https://www.jadlog.com.br/jadlog/arquivos/api_integracao.pdf

const JADLOG_SERVICES = [
  { code: String(JADLOG_MODALITY.COM),           name: 'Jadlog .COM (Expresso)' },
  { code: String(JADLOG_MODALITY.EXPRESSO),      name: 'Jadlog Expresso' },
  { code: String(JADLOG_MODALITY.PACKAGE),       name: 'Jadlog Package' },
  { code: String(JADLOG_MODALITY.RODOVIARIO),    name: 'Jadlog Rodoviário' },
  { code: String(JADLOG_MODALITY.ECONOMICO),     name: 'Jadlog Econômico' },
  { code: String(JADLOG_MODALITY.DOC),           name: 'Jadlog Doc' },
  { code: String(JADLOG_MODALITY.CORPORATE),     name: 'Jadlog Corporate' },
  { code: String(JADLOG_MODALITY.INTERNACIONAL), name: 'Jadlog Internacional' },
  { code: String(JADLOG_MODALITY.CARGO),         name: 'Jadlog Cargo' },
]

export function transformCarrier(): Carrier {
  return {
    id: 'jadlog',
    name: 'Jadlog',
    code: 'jadlog',
    trackingUrlTemplate:
      'https://www.jadlog.com.br/embarcador/tracking.jad?cte={trackingNumber}',
    services: JADLOG_SERVICES,
    isActive: true,
    metadata: { source: 'static' } as Record<string, unknown>,
  }
}
