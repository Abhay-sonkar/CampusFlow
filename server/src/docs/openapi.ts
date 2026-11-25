// Hand-written OpenAPI 3.0 description of the API: every route, who may call it, and what it returns.
// Served at /api-docs as an interactive page (Swagger UI) where requests can be tried from the browser.
export const openapiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'CampusFlow API',
    version: '1.0.0',
    description:
      'Centralized campus operations platform: notices, complaints, resource booking, opportunities, notifications.',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Paste the accessToken from /auth/login' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth' }, { name: 'Notices' }, { name: 'Complaints' },
    { name: 'Bookings' }, { name: 'Opportunities' }, { name: 'Notifications' },
  ],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Create a STUDENT account', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' }, branch: { type: 'string' }, year: { type: 'integer' } } } } } },
        responses: { '201': { description: 'Created' }, '400': { description: 'Validation failed' }, '409': { description: 'Email already registered' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Log in', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } },
        responses: { '200': { description: 'Returns accessToken; sets an httpOnly refresh cookie' }, '401': { description: 'Invalid email or password' } },
      },
    },
    '/auth/me': { get: { tags: ['Auth'], summary: 'My profile', responses: { '200': { description: 'OK' }, '401': { description: 'Not logged in' } } } },
    '/notices': {
      get: { tags: ['Notices'], summary: 'My personalised feed (published notices for my role/branch/year)', responses: { '200': { description: 'OK' } } },
      post: { tags: ['Notices'], summary: 'Create a draft notice (FACULTY/CLUB_ADMIN/COLLEGE_ADMIN)', responses: { '201': { description: 'Created' }, '403': { description: 'Not allowed' } } },
    },
    '/notices/{id}/publish': { post: { tags: ['Notices'], summary: 'Publish a notice', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/complaints': {
      get: { tags: ['Complaints'], summary: 'Complaints I filed or am assigned to', responses: { '200': { description: 'OK' } } },
      post: { tags: ['Complaints'], summary: 'File a complaint', responses: { '201': { description: 'Created' } } },
    },
    '/complaints/{id}/status': { post: { tags: ['Complaints'], summary: 'Move a complaint to IN_PROGRESS or RESOLVED (staff only)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' }, '409': { description: 'That move is not allowed from the current status' } } } },
    '/bookings': {
      post: { tags: ['Bookings'], summary: 'Request a resource for a time window', responses: { '201': { description: 'Created (PENDING)' }, '409': { description: 'Overlaps an existing booking' } } },
    },
    '/bookings/{id}/approve': { post: { tags: ['Bookings'], summary: 'Approve a pending booking (COLLEGE_ADMIN)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/resources/{id}/availability': { get: { tags: ['Bookings'], summary: 'Which time slots are taken for a resource', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/opportunities': {
      get: { tags: ['Opportunities'], summary: 'Browse opportunities (filters: q, category, skills, branch, year, eligibleForMe)', responses: { '200': { description: 'OK' } } },
      post: { tags: ['Opportunities'], summary: 'Post an opportunity (staff)', responses: { '201': { description: 'Created' } } },
    },
    '/opportunities/recommended': { get: { tags: ['Opportunities'], summary: 'My rule-based recommendations, scored and with reasons', responses: { '200': { description: 'OK' } } } },
    '/notifications': { get: { tags: ['Notifications'], summary: 'My notifications (?unread=true to filter)', responses: { '200': { description: 'OK' } } } },
  },
} as const;
