/**
 * SCIM 2.0 schema validation + serialization (RFC 7643/7644 subset).
 * Hand-rolled with Zod — the surface we need (Users, Groups, PATCH) is small.
 */
import { z } from 'zod'

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
export const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group'
export const SCIM_PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp'
export const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'

const NameSchema = z
  .object({
    formatted: z.string().optional(),
    givenName: z.string().optional(),
    familyName: z.string().optional(),
  })
  .optional()

const EmailSchema = z.object({
  value: z.string(),
  primary: z.boolean().optional(),
  type: z.string().optional(),
})

/** RFC 7643 §4.1.2 `photos`: a URL, typed `photo` (full size) or `thumbnail`. */
const PhotoSchema = z.object({
  value: z.string(),
  primary: z.boolean().optional(),
  type: z.string().optional(),
})

export const ScimUserSchema = z.object({
  schemas: z.array(z.string()).optional(),
  externalId: z.string().optional(),
  userName: z.string().min(1),
  name: NameSchema,
  displayName: z.string().optional(),
  emails: z.array(EmailSchema).optional(),
  photos: z.array(PhotoSchema).optional(),
  active: z.boolean().optional(),
})
export type ScimUserInput = z.infer<typeof ScimUserSchema>

export const ScimGroupSchema = z.object({
  schemas: z.array(z.string()).optional(),
  displayName: z.string().min(1),
  members: z.array(z.object({ value: z.string(), display: z.string().optional() })).optional(),
})

export const ScimPatchSchema = z.object({
  schemas: z.array(z.string()),
  Operations: z.array(
    z.object({
      op: z.string().transform((s) => s.toLowerCase()),
      path: z.string().optional(),
      value: z.unknown().optional(),
    }),
  ),
})
export type ScimPatch = z.infer<typeof ScimPatchSchema>

export interface ScimUserView {
  id: string
  externalId: string | null
  userName: string
  displayName: string | null
  email: string | null
  active: boolean
  createdAt: number
  updatedAt: number
}

export function toScimUser(u: ScimUserView, location: string): Record<string, unknown> {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: u.id,
    ...(u.externalId ? { externalId: u.externalId } : {}),
    userName: u.userName,
    ...(u.displayName ? { displayName: u.displayName } : {}),
    ...(u.email ? { emails: [{ value: u.email, primary: true }] } : {}),
    active: u.active,
    meta: {
      resourceType: 'User',
      created: new Date(u.createdAt).toISOString(),
      lastModified: new Date(u.updatedAt).toISOString(),
      location,
    },
  }
}

export function toScimGroup(
  g: { id: string; displayName: string; members: string[]; createdAt: number; updatedAt: number },
  location: string,
): Record<string, unknown> {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: g.id,
    displayName: g.displayName,
    members: g.members.map((m) => ({ value: m })),
    meta: {
      resourceType: 'Group',
      created: new Date(g.createdAt).toISOString(),
      lastModified: new Date(g.updatedAt).toISOString(),
      location,
    },
  }
}

export function listResponse(resources: Record<string, unknown>[], total = resources.length) {
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: total,
    startIndex: 1,
    itemsPerPage: resources.length,
    Resources: resources,
  }
}

/** Parse a SCIM filter we support: `userName eq "value"` / `displayName eq "value"`. */
export function parseEqFilter(filter: string | undefined): { attr: string; value: string } | null {
  if (!filter) return null
  const m = /^\s*(\w+)\s+eq\s+"([^"]*)"\s*$/i.exec(filter)
  if (!m) return null
  return { attr: m[1], value: m[2] }
}

export function pickEmail(input: Pick<ScimUserInput, 'emails'>): string | null {
  if (!input.emails || input.emails.length === 0) return null
  return (input.emails.find((e) => e.primary) ?? input.emails[0]).value
}

/**
 * The picture URL to use from SCIM `photos`: a `photo` entry (the primary one
 * first), else a `thumbnail`, else the first entry. Null when there is none.
 */
export function pickPhoto(input: Pick<ScimUserInput, 'photos'>): string | null {
  const photos = input.photos ?? []
  const ofType = (t: string) => photos.filter((p) => (p.type ?? '').toLowerCase() === t)
  const pick = (list: typeof photos) => list.find((p) => p.primary) ?? list[0]
  return (pick(ofType('photo')) ?? pick(ofType('thumbnail')) ?? photos[0])?.value ?? null
}

export function pickDisplayName(input: ScimUserInput): string | null {
  return (
    input.displayName ||
    input.name?.formatted ||
    [input.name?.givenName, input.name?.familyName].filter(Boolean).join(' ') ||
    null
  )
}
