/**
 * What the customer-support sandbox serves.
 *
 * Seven resources, `list` and `get` on each, no writes and no actions. The
 * only structure is that messages belong to a ticket and use the same parent
 * query-param shape as docsign's envelope-scoped resources, one level deep.
 *
 * Worth noting only because it is a trap for anything keyed by method name
 * alone: `listTags` and `listUsers` also exist in the projects vertical, at a
 * different arity. There they take a workspace id; here they are top-level.
 * Manifests are per-vertical, so the two never meet.
 *
 * Imports schemas from `../schema` and NOTHING else from the vertical:
 * `../index` would pull in `adapter/factories.ts` and its adapter clients,
 * which `check:sandbox-egress` rejects — correctly, since it would end the
 * sandbox's no-egress property.
 */
import type { SandboxResourceSpec } from '../../../sandbox/resource-spec'
import {
  ContactSchema,
  MacroSchema,
  MessageSchema,
  TagSchema,
  TeamSchema,
  TicketSchema,
  UserSchema,
} from '../schema'

export const SANDBOX_RESOURCES: SandboxResourceSpec[] = [
  { resourceType: 'tickets', schema: TicketSchema, list: 'listTickets', get: 'getTicket', seed: 3 },
  {
    resourceType: 'messages',
    schema: MessageSchema,
    list: 'listMessages',
    get: 'getMessage',
    parent: {
      resourceType: 'tickets',
      // Counting args after `credentials`: (ticketId, params) → ticketId is 0.
      argIndex: 0,
      foreignKey: 'ticketId',
      queryParam: 'ticket_id',
    },
    seed: 2,
  },
  {
    resourceType: 'contacts',
    schema: ContactSchema,
    list: 'listContacts',
    get: 'getContact',
    seed: 3,
  },
  { resourceType: 'users', schema: UserSchema, list: 'listUsers', get: 'getUser', seed: 3 },
  { resourceType: 'tags', schema: TagSchema, list: 'listTags', get: 'getTag', seed: 3 },
  { resourceType: 'teams', schema: TeamSchema, list: 'listTeams', get: 'getTeam', seed: 2 },
  { resourceType: 'macros', schema: MacroSchema, list: 'listMacros', get: 'getMacro', seed: 3 },
]
