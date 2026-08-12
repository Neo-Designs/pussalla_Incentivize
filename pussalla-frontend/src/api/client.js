// Thin fetch wrapper. Reads the JWT from sessionStorage (per the backend
// README guidance: in memory / sessionStorage so it clears on tab close),
// attaches it as a Bearer header, parses JSON, and throws on non-2xx.

const TOKEN_KEY = "pussalla.jwt";
const USER_KEY = "pussalla.user";

export const storage = {
  getToken: () => sessionStorage.getItem(TOKEN_KEY),
  setToken: (t) => sessionStorage.setItem(TOKEN_KEY, t),
  clearToken: () => { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); },
  getUser: () => {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); } catch { return null; }
  },
  setUser: (u) => sessionStorage.setItem(USER_KEY, JSON.stringify(u)),
};

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = "GET", body, signal, raw } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = storage.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const message = (data && data.error) || res.statusText || "Request failed";
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(message, res.status, data);
  }
  return raw ? text : data;
}

export const api = {
  get: (p, opts) => request(p, { method: "GET", ...opts }),
  post: (p, body, opts) => request(p, { method: "POST", body, ...opts }),
  put: (p, body, opts) => request(p, { method: "PUT", body, ...opts }),
  del: (p, opts) => request(p, { method: "DELETE", ...opts }),
};

// ---- auth -------------------------------------------------------------
export const authApi = {
  login: (code, password) => api.post("/api/auth/login", { code, password }),
  me: () => api.get("/api/auth/me"),
};

// ---- divisions --------------------------------------------------------
export const divisionsApi = {
  list: () => api.get("/api/divisions"),
};

// ---- employees --------------------------------------------------------
export const employeesApi = {
  list: () => api.get("/api/employees"),
  create: (payload) => api.post("/api/employees", payload),
  update: (id, payload) => api.put(`/api/employees/${id}`, payload),
  remove: (id) => api.del(`/api/employees/${id}`),
};

// ---- tasks ------------------------------------------------------------
export const tasksApi = {
  list: (divisionId) => api.get("/api/tasks" + (divisionId ? `?divisionId=${divisionId}` : "")),
  create: (payload) => api.post("/api/tasks", payload),
  update: (id, payload) => api.put(`/api/tasks/${id}`, payload),
  remove: (id) => api.del(`/api/tasks/${id}`),
};

// ---- cross-assignments ------------------------------------------------
export const crossApi = {
  list: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return api.get("/api/cross-assignments" + (q ? `?${q}` : ""));
  },
  create: (payload) => api.post("/api/cross-assignments", payload),
};

// ---- daily logs -------------------------------------------------------
export const dailyLogsApi = {
  list: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return api.get("/api/daily-logs" + (q ? `?${q}` : ""));
  },
  create: (payload) => api.post("/api/daily-logs", payload),
  update: (id, totalOutput) => api.put(`/api/daily-logs/${id}`, { totalOutput }),
  remove: (id) => api.del(`/api/daily-logs/${id}`),
};

// ---- reports ----------------------------------------------------------
export const reportsApi = {
  daily: (date) => api.get(`/api/reports/daily?date=${encodeURIComponent(date)}`),
  monthly: (month) => api.get(`/api/reports/monthly?month=${encodeURIComponent(month)}`),
};

// ---- audit logs -------------------------------------------------------
export const auditApi = {
  list: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return api.get("/api/audit-logs" + (q ? `?${q}` : ""));
  },
};

// ---- health -----------------------------------------------------------
export const healthApi = {
  check: () => api.get("/api/health"),
};
