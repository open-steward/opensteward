/**
 * Transform an Artia organisation user into the canonical User shape.
 *
 * Source: the `listingOrganizationUsers` and `showOrganizationUser` queries
 * (Postman collection https://documenter.getpostman.com/view/10208526/TVCZaWK4,
 * "Usuarios / Organização / Listar Usuários da Organização" and
 * "Buscar Usuário da Organização"). Their documented return parameters:
 *
 *   id        — "ID do vínculo do usuário na organização" (the membership row)
 *   user_id   — "ID do usuário"  (GraphQL field `userId`)
 *   name      — "Nome do usuário"
 *   email     — "E-mail do usuário"
 *   role      — "Papel na organização"
 *   suspended — "Se o usuário está suspenso"
 *
 * The canonical id is `userId`, because `showOrganizationUser` looks a user up
 * by it ("O campo user_id é obrigatório"), so an id from the list reads back.
 * The membership `id` is kept in metadata. The organisation id is not in the
 * payload; the caller passes the connection's configured OrganizationId.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawArtiaOrganizationUser {
  id?: string | number | null
  userId?: string | number | null
  name?: string | null
  email?: string | null
  role?: string | null
  suspended?: boolean | null
  [key: string]: unknown
}

export function transformUser(raw: RawArtiaOrganizationUser, organizationId: string): User {
  if (raw.userId == null || String(raw.userId) === '') {
    throw new Error('Artia organisation user has no userId')
  }
  const id = String(raw.userId)
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: organizationId ? [organizationId] : [],
    platform: 'artia',
    metadata: strMap({
      organizationUserId: raw.id,
      role: raw.role,
      suspended: raw.suspended,
    }),
    raw,
  }
}
