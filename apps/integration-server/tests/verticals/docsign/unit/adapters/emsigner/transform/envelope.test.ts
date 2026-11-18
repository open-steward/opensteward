import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/emsigner/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { FILES_VIEW_EXAMPLE, WORKFLOW_INFO_EXAMPLE } from './fixtures'

describe('emsigner transformEnvelope', () => {
  it('maps a GetAllDocuments row and its GetWorkflowInfo onto a valid Envelope', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(FILES_VIEW_EXAMPLE, WORKFLOW_INFO_EXAMPLE))
    expect(out.id).toBe('1')
    expect(out.externalId).toBe('1')
    expect(out.status).toBe('completed')
    expect(out.subject).toBe('sample string 3')
    expect(out.senderId).toBe('8')
    expect(out.senderName).toBe('sample string 7')
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toEqual(['1:0', '1:1'])
    expect(out.documentIds).toEqual(['3', '4'])
    expect(out.createdAt).toBe('2020-06-04T00:00:00.000Z')
    expect(out.declinedAt).toBeUndefined()
    expect(out.platform).toBe('emsigner')
    expect(out.metadata['referenceNo']).toBe('sample string 9')
    expect(out.metadata['emsignerStatus']).toBe('Completed')
  })

  it('reads a DeclinedDate in the documented yyyy-mm-dd form', () => {
    // Sample: "sample string 9". Swagger WorkflowSearchDTO documents its
    // DeclinedDate as "DeclinedDate ( in yyyy-mm-dd format(2020-06-04))".
    const out = transformEnvelope(FILES_VIEW_EXAMPLE, {
      ...WORKFLOW_INFO_EXAMPLE,
      DeclinedDate: '2020-06-04',
    })
    expect(EnvelopeSchema.parse(out).declinedAt).toBe('2020-06-04T00:00:00.000Z')
  })

  it('maps the documented statuses and leaves the rest unknown', () => {
    const at = (Status: string) =>
      EnvelopeSchema.parse(
        transformEnvelope({ ...FILES_VIEW_EXAMPLE, Status }, WORKFLOW_INFO_EXAMPLE),
      ).status
    expect(at('Pending')).toBe('sent')
    expect(at('Completed')).toBe('completed')
    expect(at('sample string 6')).toBe('unknown')
  })

  it('reads Parallel as parallel and refuses an undocumented WorkflowType', () => {
    const parallel = transformEnvelope(FILES_VIEW_EXAMPLE, {
      ...WORKFLOW_INFO_EXAMPLE,
      WorkflowType: 'Parallel',
    })
    expect(EnvelopeSchema.parse(parallel).signingOrder).toBe('parallel')
    expect(() =>
      transformEnvelope(FILES_VIEW_EXAMPLE, {
        ...WORKFLOW_INFO_EXAMPLE,
        WorkflowType: 'sample string 6',
      }),
    ).toThrow(/undocumented WorkflowType/)
  })

  it('does not read a non-ISO date', () => {
    const out = transformEnvelope(
      { ...FILES_VIEW_EXAMPLE, UploadTime: '04/06/2020' },
      WORKFLOW_INFO_EXAMPLE,
    )
    expect(EnvelopeSchema.parse(out).createdAt).toBeUndefined()
  })

  it('throws without a WorkFlowId, or when the info is for another workflow', () => {
    expect(() =>
      transformEnvelope({ ...FILES_VIEW_EXAMPLE, WorkFlowId: undefined }, WORKFLOW_INFO_EXAMPLE),
    ).toThrow(/WorkFlowId is missing/)
    expect(() =>
      transformEnvelope(FILES_VIEW_EXAMPLE, { ...WORKFLOW_INFO_EXAMPLE, WorkflowId: 2 }),
    ).toThrow(/answered workflow 2/)
  })
})
