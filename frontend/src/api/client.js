// Centralized API client for Newtonite Operations

let currentPersonaUsername = 'david_kim';

export function setApiPersona(username) {
  currentPersonaUsername = username;
}

export function getApiPersona() {
  return currentPersonaUsername;
}

export function generateIdempotencyKey(prefix = 'req') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Persona-User': currentPersonaUsername,
    ...(options.headers || {})
  };

  const config = {
    ...options,
    headers,
  };

  const response = await fetch(endpoint, config);
  const contentType = response.headers.get('content-type') || '';
  let data = null;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return {
    data,
    status: response.status,
    headers: response.headers,
  };
}

export const api = {
  // Personas
  getPersonas: () => apiRequest('/api/personas/').then(res => res.data),
  getCurrentUser: () => apiRequest('/api/me/').then(res => res.data),

  // Teams
  getTeams: () => apiRequest('/api/teams/').then(res => res.data?.results || res.data || []),

  // Work Items
  getWorkItems: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        query.append(k, v);
      }
    });
    return apiRequest(`/api/work-items/?${query.toString()}`).then(res => res.data);
  },

  getWorkItem: (id) => apiRequest(`/api/work-items/${id}/`).then(res => res.data),

  createWorkItem: (payload, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return apiRequest('/api/work-items/', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }).then(res => res.data);
  },

  updateWorkItem: (id, payload, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return apiRequest(`/api/work-items/${id}/`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    }).then(res => res.data);
  },

  claimWorkItem: (id, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return apiRequest(`/api/work-items/${id}/claim/`, {
      method: 'POST',
      headers,
    }).then(res => res.data);
  },

  transitionWorkItem: (id, payload, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return apiRequest(`/api/work-items/${id}/transition/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }).then(res => res.data);
  },

  requestApproval: (id, payload, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return apiRequest(`/api/work-items/${id}/request-approval/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }).then(res => res.data);
  },

  decideApproval: (id, payload, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return apiRequest(`/api/work-items/${id}/decide-approval/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }).then(res => res.data);
  },

  addComment: (id, content, idempotencyKey = null) => {
    const headers = {};
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return apiRequest(`/api/work-items/${id}/comments/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content }),
    }).then(res => res.data);
  },

  getMetrics: () => apiRequest('/api/work-items/metrics/').then(res => res.data),

  // Outbox
  getOutboxEvents: () => apiRequest('/api/outbox/events/').then(res => res.data),
  processOutboxBatch: (batchSize = 20) => apiRequest('/api/outbox/process/', {
    method: 'POST',
    body: JSON.stringify({ batch_size: batchSize }),
  }).then(res => res.data),
};
