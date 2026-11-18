/**
 * The documented response of `GET /api/packages/{packageId}/audit`, verbatim
 * from https://docs.onespan.com/docs/retrieving-an-audit-trail (REST API tab,
 * "Response Payload").
 */
export const AUDIT_RESPONSE_EXAMPLE = {
  'package-id': 'c2e57376-7391-4559-8da9-5d0ed4a24c56',
  'audit-events': [
    {
      type: 'Signing Session For Signer',
      'date-time': '2016-04-20 14:14:51',
      target: 'signing url group',
      user: 'somegroup',
      'user-email': '9fe0d028-0572-4731-8520-99191340d78f@groups.esignlive.com',
      'user-ip': '11.11.111.111',
      data: 'Signing session to signer : 9fe0d028-0572-4731-8520-99191340d78f@groups.esignlive.com(somegroup',
    },
    {
      type: 'View',
      'date-time': '2016-04-20 14:14:54',
      target: 'doc1',
      user: 'somegroup',
      'user-email': '9fe0d028-0572-4731-8520-99191340d78f@groups.esignlive.com',
      'user-ip': '11.11.111.111',
      data: null,
    },
    {
      type: 'Click To Sign',
      'date-time': '2016-04-20 14:23:31',
      target: 'doc1',
      user: 'somegroup',
      'user-email': '9fe0d028-0572-4731-8520-99191340d78f@groups.esignlive.com',
      'user-ip': '11.11.111.111',
      data: 'Approval: FAPOezPt0H8E',
    },
    {
      type: 'View',
      'date-time': '2016-04-20 15:20:47',
      target: 'doc1',
      user: 'Haris Haidary',
      'user-email': 'esl.signer1@example.com',
      'user-ip': '11.11.111.111',
      data: null,
    },
    {
      type: 'View',
      'date-time': '2016-04-20 15:23:52',
      target: 'doc1',
      user: 'Haris Haidary',
      'user-email': 'esl.signer1@example.com',
      'user-ip': '11.11.111.111',
      data: null,
    },
    {
      type: 'View',
      'date-time': '2016-04-20 15:44:41',
      target: 'doc1',
      user: 'Haris Haidary',
      'user-email': 'esl.signer1@example.com',
      'user-ip': '11.11.111.111',
      data: null,
    },
    {
      type: 'View',
      'date-time': '2016-04-20 15:44:47',
      target: 'doc1',
      user: 'Haris Haidary',
      'user-email': 'esl.signer1@example.com',
      'user-ip': '11.11.111.111',
      data: null,
    },
  ],
}
