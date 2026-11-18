/**
 * Tiledesk auth — email + password sign-in.
 *
 * The caller supplies email, password, and project_id. We POST to
 * /v3/auth/signin which returns a JWT token. That token is stored as
 * `accessToken`; the project_id is stored in `extra.projectId` so the
 * client can build tenant-scoped URLs.
 *
 * All subsequent calls use:  Authorization: JWT <token>
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import axios from 'axios'
import { API_BASE_URL, AUTH_SIGNIN_PATH } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('tiledesk uses email/password auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'email',      label: 'Agent Email',    type: 'text',     required: true },
    { name: 'password',   label: 'Agent Password', type: 'password', required: true },
    { name: 'projectId',  label: 'Project ID',     type: 'text',     required: true },
  ]
}

interface SigninResponse {
  token: string
  user?: { id?: string; email?: string }
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { email, password, projectId } = fields
  if (!email)     throw new Error('tiledesk credentialFields require email')
  if (!password)  throw new Error('tiledesk credentialFields require password')
  if (!projectId) throw new Error('tiledesk credentialFields require projectId')

  const { data } = await axios.post<SigninResponse>(
    `${API_BASE_URL}${AUTH_SIGNIN_PATH}`,
    { email, password },
    { headers: { 'Content-Type': 'application/json' } },
  )

  if (!data.token) throw new Error('tiledesk sign-in did not return a token')

  return {
    accessToken: data.token,
    extra: { projectId },
  }
}
