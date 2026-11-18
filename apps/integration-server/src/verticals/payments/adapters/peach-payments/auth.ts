import type { Credentials } from '@opensteward/shared'

/**
 * "To make REST API calls, include the access token in the authorisation
 * header with the bearer authentication scheme", and `entityId`: "The entity
 * required to authorise the request. This should be the channel entity
 * identifier." Two separate credentials.
 * https://developer.peachpayments.com/docs/oppwa-references-api
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const accessToken = fields.accessToken?.trim()
  const entityId = fields.entityId?.trim()
  if (!accessToken) throw new Error('Peach Payments: accessToken is required')
  if (!entityId) throw new Error('Peach Payments: entityId is required')
  return { accessToken, extra: { entityId } }
}

/** The connection's entity id, or a 501 naming it when the connection predates it. */
export function entityIdOf(credentials: Credentials): string {
  const v = credentials.extra?.['entityId']
  if (typeof v === 'string' && v.length > 0) return v
  throw Object.assign(
    new Error(
      'Peach Payments needs the connection\'s entityId ("The entity required to authorise the ' +
        'request"): reconnect with both the access token and the entity ID.',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}
