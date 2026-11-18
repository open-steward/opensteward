/**
 * Megaplan Connect Link form.
 *
 * Every Megaplan account is served from its own host, and the API lives under
 * that host: "Все ресурсы APIv3 доступны по URLs с префиксом /api/v3/" and
 * "Описание всех методов и сущностей доступно внутри аккаунта Мегапалана по
 * пути /api/v3/docs" (https://dev.megaplan.ru/apiv3/index.html, whose examples
 * use https://demo.megaplan.ru/api/v3/…). There is no shared API host: the
 * old fallback, app.megaplan.ru, answers /api/v3/contractor with 404
 * "Аккаунт не найден". So the account is collected with the token and stored
 * as `credentials.extra.baseUrl`, the key the client reads.
 *
 * Token: "Авторизационный токен нужно передавать с каждым запросом к API в
 * заголовоке AUTHORIZATION: Bearer MmMzNDc1NTQzN..." (same page).
 */
import { customForm, type CredentialField, type Credentials } from '@opensteward/shared'

const MEGAPLAN_SUFFIX = '.megaplan.ru'
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const FIELDS: CredentialField[] = [
  {
    name: 'account',
    label: 'Megaplan account',
    type: 'text',
    required: true,
    placeholder: 'acme.megaplan.ru',
    helpText:
      'The address you sign in to Megaplan at, e.g. acme.megaplan.ru (just "acme" also works).',
  },
  {
    name: 'apiKey',
    label: 'API token',
    type: 'password',
    required: true,
    helpText: 'A Megaplan API v3 access token, sent as "Authorization: Bearer <token>".',
  },
]

function hostOf(value: string): string {
  if (value.includes('://')) {
    try {
      return new URL(value).hostname
    } catch {
      return value
    }
  }
  return value.split(/[/?#]/)[0] ?? ''
}

/** Accepts `acme`, `acme.megaplan.ru` or a pasted account URL; returns `https://acme.megaplan.ru`. */
export function normaliseMegaplanAccount(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) throw new Error('Megaplan account is required.')
  const parsed = hostOf(value)
  const host = parsed.includes('.') ? parsed : `${parsed}${MEGAPLAN_SUFFIX}`
  const account = host.endsWith(MEGAPLAN_SUFFIX) ? host.slice(0, -MEGAPLAN_SUFFIX.length) : ''
  if (!LABEL_PATTERN.test(account)) {
    throw new Error(
      `Megaplan account must be your megaplan.ru address such as acme.megaplan.ru; "${parsed}" is not a megaplan.ru account.`,
    )
  }
  return `https://${account}${MEGAPLAN_SUFFIX}`
}

export const CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API token is required.')
    const baseUrl = normaliseMegaplanAccount(input['account'])
    return { accessToken: apiKey, extra: { baseUrl } }
  },
})
