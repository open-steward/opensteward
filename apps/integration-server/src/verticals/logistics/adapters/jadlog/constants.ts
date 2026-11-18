/**
 * Jadlog Embarcador API constants.
 *
 * Base URL: https://www.jadlog.com.br/embarcador/api
 * Auth:     Bearer token — obtained from Jadlog's commercial department.
 *
 * Jadlog uses a RESTful JSON API with Bearer-token authentication.
 * All requests require `Authorization: Bearer <token>` and
 * `Content-Type: application/json` headers.
 */
export const JADLOG_API_BASE = 'https://www.jadlog.com.br/embarcador/api'

export const JADLOG_DASHBOARD_URL = 'https://www.jadlog.com.br/embarcador'

/**
 * Jadlog service modality codes.
 * 0 = .COM (expressão), 3 = EXPRESSO, 4 = PACKAGE, 5 = RODOVIÁRIO,
 * 6 = ECONÔMICO, 7 = DOC, 8 = CORPORATE, 9 = INTERNACIONAL, 10 = CARGO.
 */
export const JADLOG_MODALITY = {
  COM: 0,
  EXPRESSO: 3,
  PACKAGE: 4,
  RODOVIARIO: 5,
  ECONOMICO: 6,
  DOC: 7,
  CORPORATE: 8,
  INTERNACIONAL: 9,
  CARGO: 10,
} as const

/** Jadlog delivery-type codes. 'D' = door-to-door, 'R' = pick-up at agency. */
export const JADLOG_DELIVERY_TYPES = {
  DOOR: 'D',
  AGENCY: 'R',
} as const

/**
 * PUDO network list ("Consulta Pickup Points Diário", Documento de Integração
 * v2.3, p. 25): "Filtros sem utilizar CEP / 1) Retorno para todos os Pudos /
 * Endpoint: https://www.jadlog.com.br/pickup/address/pudos?tipos=LOCKER,PUBLICO,JADLOG".
 * It is not under the Embarcador API base, so it is requested by absolute URL.
 */
export const JADLOG_PUDOS_URL = 'https://www.jadlog.com.br/pickup/address/pudos'

/** Every documented PUDO type, for the `tipos` query parameter. */
export const JADLOG_PUDO_TYPES = 'LOCKER,PUBLICO,JADLOG'
