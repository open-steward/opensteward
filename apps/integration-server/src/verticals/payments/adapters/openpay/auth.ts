import type { Credentials } from '@opensteward/shared'

/**
 * Openpay uses HTTP Basic auth: API key as username, empty password.
 * "Para la autenticación al API debes usar autenticación de acceso básica ,
 * donde la llave de API es el nombre de usuario. La contraseña no es requerida
 * y debe dejarse en blanco por fines de simplicidad."
 * (https://documents.openpay.mx/docs/api/index.html)
 *
 * Every endpoint also carries the merchant id: "Un endpoint completo esta
 * formado por la URI base del ambiente, el identificador del comercio y el
 * recurso." It is kept in `extra.merchantId`.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const key = fields.apiKey ?? fields.secretKey ?? ''
  const merchantId = (fields.merchantId ?? '').trim()
  if (!merchantId) throw new Error('Openpay Merchant ID is required.')
  const encoded = Buffer.from(`${key}:`).toString('base64')
  return { accessToken: encoded, extra: { merchantId } }
}

/**
 * The merchant id of a connection, or a 501 naming it. Connections made before
 * the id was collected have none and must reconnect.
 */
export function merchantIdOf(credentials: Credentials): string {
  const id = credentials.extra?.['merchantId']
  if (typeof id !== 'string' || id.trim() === '') {
    throw Object.assign(
      new Error(
        'Openpay needs the Merchant ID for every request ("Un endpoint completo esta formado por la URI base del ambiente, el identificador del comercio y el recurso."); reconnect with the Merchant ID.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
  return id.trim()
}
