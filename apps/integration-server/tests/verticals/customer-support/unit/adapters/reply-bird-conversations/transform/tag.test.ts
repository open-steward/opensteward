/**
 * Bird mailbox label → canonical Tag.
 *
 * Fixture: `EmailMailboxLabel` items of `GET /v1/email/mailboxes/{mailbox_id}/labels`
 * (https://bird.com/docs/api/reference/list-mailbox-labels): `name` (example
 * "inbox", and the custom label "urgent" from the thread `labels` example) and
 * `type` (`system` | `custom`).
 */
import { describe, it, expect } from 'vitest'
import { TagSchema } from '../../../../../../../src/verticals/customer-support/schema/tag'
import {
  parseLabelTagId,
  transformTag,
} from '../../../../../../../src/verticals/customer-support/adapters/reply-bird-conversations/transform/tag'

const MBX = 'mbx_01krdgeqcxet5s7t44vh8rt9mg'

describe('Bird transformTag', () => {
  it('maps a custom label to a mailbox-scoped Tag', () => {
    const t = TagSchema.parse(transformTag(MBX, { name: 'urgent', type: 'custom' }))
    expect(t).toMatchObject({
      id: `${MBX}:urgent`,
      externalId: `${MBX}:urgent`,
      name: 'urgent',
      platform: 'reply-bird-conversations',
      metadata: { mailboxId: MBX },
    })
    expect(t.color).toBeUndefined()
  })

  it('parses a tag id back into its mailbox and label, keeping colons in the label', () => {
    expect(parseLabelTagId(`${MBX}:urgent`)).toEqual({ mailboxId: MBX, name: 'urgent' })
    expect(parseLabelTagId(`${MBX}:a:b`)).toEqual({ mailboxId: MBX, name: 'a:b' })
    expect(parseLabelTagId('urgent')).toBeUndefined()
    expect(parseLabelTagId(`${MBX}:`)).toBeUndefined()
    expect(parseLabelTagId('tag_1:urgent')).toBeUndefined()
  })
})
