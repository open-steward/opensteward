/**
 * Example objects copied from Rebill's API reference.
 *
 * - customer: https://docs.rebill.com/api/reference/customers ("The customer object")
 * - payment: https://docs.rebill.com/api/reference/payments ("Payment Example")
 * - plan: https://docs.rebill.com/api/reference/plans ("The plan object")
 * - subscription: https://docs.rebill.com/api/reference/subscriptions ("Subscription Example")
 */
export function documentedCustomer() {
  return {
    id: 'cus_786176c9d39f40d8af98428edb2aa3db',
    firstName: 'Ana',
    lastName: 'Lopez',
    email: 'ana@example.com',
    phoneNumbers: [{ countryCode: '54', number: '1153190141' }],
    addresses: [
      {
        id: 'addr_12aa31cdfb574e4191e96e67523a3560',
        country: 'AR',
        state: 'Buenos Aires',
        city: 'Buenos Aires',
        zipCode: '1043',
        lineOne: 'Av. Corrientes 1234',
        lineTwo: 'Piso 5, Depto A',
        createdAt: '2026-04-02T10:12:00.000Z',
      },
    ],
    identifications: [
      {
        id: 'id_54c0a9c9a07249f8987e237f214fde9b',
        type: 'DNI',
        value: '43044413',
        createdAt: '2026-04-02T10:12:00.000Z',
      },
    ],
    cards: [
      {
        id: 'crd_d16eb336861744e3aadc6d29874bd9a1',
        createdAt: '2026-04-18T14:39:56.747Z',
        name: 'Ana Lopez',
        bin: '453914',
        brand: 'visa',
        type: 'credit',
        lastFour: '6467',
        status: 'operative',
        expiration: { month: '11', year: '2099' },
      },
    ],
    metadata: { internal_id: 'customer_9182' },
    createdAt: '2026-04-02T10:12:00.000Z',
  }
}

export function documentedPayment() {
  return {
    id: 'pay_d03f9b0c037f44e99107210bc39184fd',
    createdAt: '2025-05-15T16:56:06.603Z',
    updatedAt: '2025-05-15T16:56:06.603Z',
    organizationId: 'org_8fa0d70f8ab54c7d8e54bc356422b2bd',
    amount: 10000,
    currency: 'ARS',
    customer: {
      id: 'cus_08d93677c7ca45abbea1a0dc21b85aed',
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      defaultLanguage: 'es',
      phone: '+5491123456789',
    },
    status: 'approved',
    metadata: null,
    paymentMethodType: 'card',
    card: {
      id: 'crd_99b867433c3c46759ad14f5ae9046894',
      brand: 'visa',
      type: 'credit',
      lastFourDigits: '1111',
      name: 'John Doe',
    },
    quantity: 1,
    installments: null,
    couponId: null,
    description: 'Premium Plan',
    discount: null,
    processingMode: 'local',
    errorDetail: null,
    errorType: null,
    isProviderError: false,
    subscriptionId: null,
    country: 'AR',
    timezone: 'America/Argentina/Buenos_Aires',
    traceId: 'aB1745412426000',
    type: 'one_time_payment',
    origin: 'sdk',
    oneClick: true,
  }
}

export function documentedPlan() {
  return {
    id: 'pln_3724ff11fa5c4853bea5a22b2867191b',
    name: [
      { language: 'es', text: 'Plan Mensual Premium' },
      { language: 'en', text: 'Monthly Premium Plan' },
    ],
    description: [{ language: 'es', text: 'Acceso completo, renovación automática' }],
    status: 'active',
    frequency: { period: 'month', count: 1 },
    debitDay: 5,
    debitStrategy: 'charge_next_cycle',
    prices: [
      {
        amount: 99.99,
        currency: 'USD',
        isDefault: true,
        setupFee: 10.0,
        createdAt: '2026-04-10T12:00:00.000Z',
        updatedAt: '2026-04-10T12:00:00.000Z',
      },
      {
        amount: 2500.0,
        currency: 'ARS',
        isDefault: false,
        createdAt: '2026-04-10T12:00:00.000Z',
        updatedAt: '2026-04-10T12:00:00.000Z',
      },
    ],
    metadata: { internal_id: 'plan_premium_v2' },
    createdAt: '2026-04-10T12:00:00.000Z',
    updatedAt: '2026-04-10T12:00:00.000Z',
  }
}

export function documentedSubscription() {
  return {
    id: 'sub_ad128372a40b8dbac50a8ca20c7305b',
    name: 'Premium Plan',
    description: 'Premium subscription plan',
    status: 'active',
    statusDetail: 'active',
    lastChargeDate: '2026-03-05T15:59:59.000Z',
    nextChargeDate: '2026-04-05T15:59:59.000Z',
    amount: 15000.0,
    lastChargedAmount: 15000.0,
    currency: 'ARS',
    setupFee: 0,
    frequency: { period: 'month', count: 1 },
    billingCycles: { total: 12, current: 1, remaining: 11 },
    plan: {
      id: 'pln_647838573cf58d61bc659f6525f528ba',
      title: 'Premium Plan',
      amount: 15000.0,
      currency: 'ARS',
      frequency: { period: 'month', quantity: 1 },
      repetitions: 12,
    },
    paymentMethod: 'card',
    card: {
      id: 'crd_647838573cf58d61bc659f6525f528ba',
      brand: 'visa',
      type: 'credit',
      lastFourDigits: '4242',
    },
    discount: {
      couponCode: 'DESC10',
      type: 'percentage',
      percentage: 10,
      billingCyclesToApply: { total: 12, remaining: 11 },
    },
    customer: {
      id: 'cus_647838573cf58d61bc659f6525f528ba',
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+1234567890',
    },
    createdAt: '2026-03-05T15:59:59.000Z',
    updatedAt: '2026-03-05T16:00:00.000Z',
    metadata: { customField: 'value' },
  }
}
