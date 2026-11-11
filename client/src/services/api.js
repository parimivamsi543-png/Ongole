const API_BASE = '/api';

const request = async (path, options = {}) => {
  const token = localStorage.getItem('ledgerline_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  const isReplay = res.headers.get('idempotent-replay') === 'true';

  if (!res.ok) {
    const err = new Error(data.reason || data.message || data.error || 'Request failed');
    err.status = res.status;
    err.code = data.error;
    err.data = data;
    throw err;
  }

  return { data, status: res.status, isReplay };
};

export const generateIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

export const api = {
  health: () => request('/health'),

  auth: {
    login: (email, password) =>
      request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (payload) =>
      request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    me: () => request('/auth/me'),
  },

  accounts: {
    getMy: () => request('/accounts/my'),
    getAll: () => request('/accounts'),
    getDirectory: () => request('/accounts/directory'),
    getUsers: () => request('/accounts/users'),
    getById: (id) => request(`/accounts/${id}`),
    create: (payload) =>
      request('/accounts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateStatus: (id, status) =>
      request(`/accounts/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    updateOverdraft: (id, overdraftLimit, justification) =>
      request(`/accounts/${id}/overdraft`, {
        method: 'PATCH',
        body: JSON.stringify({ overdraftLimit, justification }),
      }),
  },

  transactions: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/transactions${qs ? `?${qs}` : ''}`);
    },
    getById: (transactionId) => request(`/transactions/${transactionId}`),
    deposit: (payload, idempotencyKey = generateIdempotencyKey()) =>
      request('/transactions/deposit', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      }),
    withdraw: (payload, idempotencyKey = generateIdempotencyKey()) =>
      request('/transactions/withdraw', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      }),
    transfer: (payload, idempotencyKey = generateIdempotencyKey()) =>
      request('/transactions/transfer', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      }),
  },

  statements: {
    getAccountStatement: (accountId, params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/statements/${accountId}${qs ? `?${qs}` : ''}`);
    },
  },

  audit: {
    getLogs: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/audit/logs${qs ? `?${qs}` : ''}`);
    },
    getIntegrity: () => request('/audit/integrity'),
    getLedgerEntries: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/audit/ledger-entries${qs ? `?${qs}` : ''}`);
    },
  },

  adversarial: {
    runConcurrency: (payload) =>
      request('/adversarial/concurrency', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    runIdempotency: (payload) =>
      request('/adversarial/idempotency', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    runOverdraft: (payload) =>
      request('/adversarial/overdraft', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    runUnauthorizedTransfer: (payload) =>
      request('/adversarial/unauthorized-transfer', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    runTamperCheck: () =>
      request('/adversarial/tamper-check', {
        method: 'POST',
      }),
    runTamperSimulate: () =>
      request('/adversarial/tamper-simulate', {
        method: 'POST',
      }),
  },
};
