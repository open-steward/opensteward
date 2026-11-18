import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/boldsign/transform/signer'
import type { RawBoldsignSignerDetail } from '../../../../../../../src/verticals/docsign/adapters/boldsign/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const SIGNED_EPOCH = 1708000000 // 2024-02-15T12:26:40.000Z
const DOC_ID = 'doc-abc-123'

describe('boldsign transformSigner', () => {
  it('maps id and externalId as documentId:email', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      status: 'Completed',
      order: 1,
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.id).toBe('doc-abc-123:alice@example.com')
    expect(result.externalId).toBe('doc-abc-123:alice@example.com')
  })

  it('maps envelopeId to documentId', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      status: 'Completed',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.envelopeId).toBe(DOC_ID)
  })

  it('maps email from signerEmail', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      status: 'Completed',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps name from signerName', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice Doe',
      status: 'Completed',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.name).toBe('Alice Doe')
  })

  it('maps completed status to signed', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      status: 'Completed',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.status).toBe('signed')
  })

  it('maps signed status to signed', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      status: 'Signed',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.status).toBe('signed')
  })

  it('maps declined status to declined', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'bob@example.com',
      signerName: 'Bob',
      status: 'Declined',
      declineMessage: 'Terms unacceptable',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.status).toBe('declined')
    expect(result.declineReason).toBe('Terms unacceptable')
  })

  it('maps viewed status to delivered', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'carol@example.com',
      signerName: 'Carol',
      status: 'Viewed',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.status).toBe('delivered')
  })

  it('maps delivered status to delivered', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'carol@example.com',
      signerName: 'Carol',
      status: 'Delivered',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.status).toBe('delivered')
  })

  it('maps notcompleted status to sent', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'dave@example.com',
      signerName: 'Dave',
      status: 'NotCompleted',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.status).toBe('sent')
  })

  it('maps waitingforsign status to sent', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'dave@example.com',
      signerName: 'Dave',
      status: 'WaitingForSign',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.status).toBe('sent')
  })

  it('maps unknown status to created', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'eve@example.com',
      signerName: 'Eve',
      status: 'SomeUnknownStatus',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.status).toBe('created')
  })

  it('maps cc signerType to cc role', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'cc@example.com',
      signerName: 'CC Person',
      signerType: 'CC',
      status: 'Sent',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.role).toBe('cc')
  })

  it('maps inpersonsigner signerType to in_person_signer role', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'person@example.com',
      signerName: 'In Person',
      signerType: 'InPersonSigner',
      status: 'NotCompleted',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.role).toBe('in_person_signer')
  })

  it('maps reviewer signerType to approver role', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'reviewer@example.com',
      signerName: 'Reviewer',
      signerType: 'Reviewer',
      status: 'NotCompleted',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.role).toBe('approver')
  })

  it('maps approver signerType to approver role', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'approver@example.com',
      signerName: 'Approver',
      signerType: 'Approver',
      status: 'NotCompleted',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.role).toBe('approver')
  })

  it('maps editor signerType to editor role', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'editor@example.com',
      signerName: 'Editor',
      signerType: 'Editor',
      status: 'NotCompleted',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.role).toBe('editor')
  })

  it('maps preparer signerType to editor role', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'prep@example.com',
      signerName: 'Preparer',
      signerType: 'Preparer',
      status: 'NotCompleted',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.role).toBe('editor')
  })

  it('maps unknown signerType to default signer role', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'signer@example.com',
      signerName: 'Signer',
      signerType: 'Signer',
      status: 'NotCompleted',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.role).toBe('signer')
  })

  it('maps signedDate epoch to signedAt ISO', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      status: 'Completed',
      signedDate: SIGNED_EPOCH,
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.signedAt).toBe(new Date(SIGNED_EPOCH * 1000).toISOString())
  })

  it('maps routingOrder from order field when >= 1', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      status: 'Completed',
      order: 2,
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.routingOrder).toBe(2)
  })

  it('leaves routingOrder undefined when order is 0', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      status: 'Completed',
      order: 0,
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.routingOrder).toBeUndefined()
  })

  it('puts signerType and authenticationType into metadata', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      signerType: 'Signer',
      authenticationType: 'EmailOTP',
      status: 'Completed',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.metadata.signerType).toBe('Signer')
    expect(result.metadata.authenticationType).toBe('EmailOTP')
  })

  it('sets platform to boldsign', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      status: 'Completed',
    }
    const result = transformSigner(raw, DOC_ID)
    expect(result.platform).toBe('boldsign')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const raw: RawBoldsignSignerDetail = {
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      signerType: 'Signer',
      status: 'Completed',
      order: 1,
      signedDate: SIGNED_EPOCH,
    }
    const result = transformSigner(raw, DOC_ID)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
