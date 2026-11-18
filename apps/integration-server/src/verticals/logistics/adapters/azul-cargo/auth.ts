import axios from 'axios'
import { customForm } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { AZUL_CARGO_API_BASE, AZUL_CARGO_DOCS_URL } from './constants'

/**
 * Azul Cargo logs in with an e-mail and password and hands back a token that
 * every later call carries in its JSON body. There is no OAuth flow and no
 * API-key header.
 *
 * https://ediapi.onlineapp.com.br/toolkit/swagger/docs/v1
 *   "/api/Autenticacao/AutenticarUsuario":{"post":{..."parameters":[{"name":"Usuario",
 *     "in":"body",..."$ref":"#/definitions/WebApiToolkitIntegracao.Areas.Seguranca.Models.Usuario"}]
 *   "WebApiToolkitIntegracao.Areas.Seguranca.Models.Usuario":{"properties":{"Email":{...},"Senha":{...}}}
 *   "Library.APILibrary.Helpers.JSON_RepostaPadrao":{"properties":{"ErrorText":{"type":"string"},
 *     "HasErrors":{"type":"boolean"},"Value":{"type":"object"}}}
 *
 * The spec documents no token lifetime, so the adapter logs in again before
 * each read rather than trusting a stored token; the e-mail and password are
 * kept on `credentials.extra` for that.
 */

export interface AzulCargoLogin {
  email: string
  senha: string
}

interface JsonRespostaPadrao {
  ErrorText?: string | null
  HasErrors?: boolean
  Value?: unknown
}

export function buildAuthUrl(_state: string): string {
  // No OAuth2 flow — point the customer at the toolkit's own documentation.
  return AZUL_CARGO_DOCS_URL
}

/** POST /api/Autenticacao/AutenticarUsuario {Email, Senha} → token (`Value`). */
export async function authenticate(login: AzulCargoLogin): Promise<string> {
  const { data } = await axios.post<JsonRespostaPadrao>(
    `${AZUL_CARGO_API_BASE}Autenticacao/AutenticarUsuario`,
    { Email: login.email, Senha: login.senha },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  if (data?.HasErrors) {
    throw new Error(`Azul Cargo login failed: ${data.ErrorText ?? 'HasErrors is true'}`)
  }
  if (typeof data?.Value !== 'string' || data.Value === '') {
    throw new Error('Azul Cargo login returned no token in Value')
  }
  return data.Value
}

/** Read the stored login off a connection, or say it must reconnect. */
export function loginFrom(credentials: Credentials): AzulCargoLogin {
  const email = credentials.extra?.['email']
  const senha = credentials.extra?.['senha']
  if (typeof email !== 'string' || !email || typeof senha !== 'string' || !senha) {
    throw new Error(
      'Azul Cargo connection has no e-mail and password; reconnect with the EDI toolkit login',
    )
  }
  return { email, senha }
}

async function connect(login: AzulCargoLogin): Promise<Credentials> {
  const token = await authenticate(login)
  return { accessToken: token, extra: { email: login.email, senha: login.senha } }
}

export const AZUL_CARGO_FORM = customForm({
  fields: [
    { name: 'email', label: 'E-mail', type: 'email', required: true },
    { name: 'senha', label: 'Senha (password)', type: 'password', required: true },
  ],
  async exchange(input) {
    const email = (input?.['email'] ?? '').trim()
    const senha = input?.['senha'] ?? ''
    if (!email || !senha) throw new Error('E-mail and password are required.')
    return connect({ email, senha })
  },
})

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return connect(loginFrom(credentials))
}
