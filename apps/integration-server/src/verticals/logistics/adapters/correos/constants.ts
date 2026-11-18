export const CORREOS_API_BASE = 'https://api.correos.es/digital/v1'
export const CORREOS_TOKEN_PATH = '/oauth2/token'
export const CORREOS_DASHBOARD_URL = 'https://developers.correos.es/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 15

export const TRACKING_STATUS_MAP: Record<string, string> = {
  ADMITIDO: 'PRE_TRANSIT',
  EN_TRANSITO: 'IN_TRANSIT',
  EN_REPARTO: 'OUT_FOR_DELIVERY',
  ENTREGADO: 'DELIVERED',
  AUSENTE: 'FAILURE',
  DEVUELTO: 'RETURN_TO_SENDER',
  EN_OFICINA: 'AVAILABLE_FOR_PICKUP',
}
