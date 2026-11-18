/**
 * Shared schema primitives for customer-support vertical.
 *
 * Read-only B2B tenant-mode. Schema-as-firewall: no attachment content,
 * no voice/call recording audio (or transcript metadata), no AI-generated
 * summaries, no contact PII beyond email + name + phone.
 */
import { z } from 'zod'
import { withUnknown } from '@opensteward/shared'

export const TicketStatusSchema = withUnknown([
  'open',
  'pending',
  'in_progress',
  'on_hold',
  'resolved',
  'closed',
])
export type TicketStatus = z.infer<typeof TicketStatusSchema>

export const TicketPrioritySchema = withUnknown(['low', 'normal', 'high', 'urgent'])
export type TicketPriority = z.infer<typeof TicketPrioritySchema>

export const ChannelSchema = withUnknown([
  'email',
  'chat',
  'voice',
  'social',
  'web',
  'sms',
  'api',
  'other',
])
export type Channel = z.infer<typeof ChannelSchema>

export const MessageTypeSchema = withUnknown(['public', 'internal'])
export type MessageType = z.infer<typeof MessageTypeSchema>

export const AuthorTypeSchema = withUnknown(['contact', 'user', 'system'])
export type AuthorType = z.infer<typeof AuthorTypeSchema>
