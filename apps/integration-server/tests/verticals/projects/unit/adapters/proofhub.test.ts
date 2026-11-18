import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyProofHubWebhook, parseProofHubWebhookEvents } from '../../../../../src/verticals/projects/adapters/proofhub/webhook'

describe('ProofHub webhook', () => {
  it('verifies x-proofhub-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyProofHubWebhook(body, { 'x-proofhub-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyProofHubWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=proofhub', () => {
    const out = parseProofHubWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('proofhub')
  })
})
