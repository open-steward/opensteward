import { createSign } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'

/**
 * Stark Bank signs every request; there is no bearer token.
 *
 * https://docs.starkbank.com/api (Authentication, CUSTOM HEADERS):
 * "Access-Id: Static string that identifies the user: project/{projectId} for
 * projects; ..." / "Access-Time: Current Unix-Time: the number of seconds
 * since 1 January 1970." / "Access-Signature: Base64-encoded ECDSA signature
 * of Access-Id + ":" + Access-Time + ":" + body, where body is the JSON string
 * for POST/PUT/PATCH requests and an empty string for GET/DELETE requests."
 *
 * The private key is the project's secp256k1 PEM (the docs' example key opens
 * with "-----BEGIN EC PARAMETERS----- BgUrgQQACg==", the secp256k1 OID). The
 * official SDK signs with SHA-256 and sends the DER signature in base64
 * (`Ecdsa.sign(message, user.privateKey()).toBase64()` in starkcore), which is
 * what Node's `createSign('SHA256')` produces for an EC key.
 */

export function buildCredentials(fields: Record<string, string>): Credentials {
  const privateKey = normalisePem(fields.apiKey ?? '')
  const projectId = (fields.projectId ?? '').trim()
  if (!privateKey) throw new Error('Stark Bank needs the project private key (PEM).')
  if (!projectId)
    throw new Error('Stark Bank needs the project id (Access-Id project/{projectId}).')
  return { accessToken: privateKey, extra: { projectId } }
}

/** A PEM pasted into a single-line field often arrives with literal `\n`. */
function normalisePem(pem: string): string {
  return pem.replace(/\\n/g, '\n').trim()
}

/** The connection's Access-Id, or a refusal naming what is missing. */
export function accessIdFrom(credentials: Credentials): string {
  const projectId = credentials.extra?.['projectId']
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    throw Object.assign(
      new Error(
        'Stark Bank connection has no projectId: requests are signed as Access-Id ' +
          'project/{projectId}. Reconnect with the project id and private key.',
      ),
      { statusCode: 401, code: 'RECONNECT_REQUIRED' },
    )
  }
  return `project/${projectId.trim()}`
}

/** The three documented auth headers for one request. */
export function signedHeaders(
  credentials: Credentials,
  body: string,
  now: () => number = Date.now,
): Record<string, string> {
  const accessId = accessIdFrom(credentials)
  const accessTime = String(Math.round(now() / 1000))
  const signer = createSign('SHA256')
  signer.update(`${accessId}:${accessTime}:${body}`)
  signer.end()
  return {
    'Access-Id': accessId,
    'Access-Time': accessTime,
    'Access-Signature': signer.sign(normalisePem(credentials.accessToken)).toString('base64'),
  }
}
