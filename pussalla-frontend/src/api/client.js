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

  // Non-JSON responses (CSV / PDF downloads): return a Blob.
  const ctype = res.headers.get("content-type") || "";
  if (!res.ok) {
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    const message = (data && data.error) || res.statusText || "Request failed";
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(message, res.status, data);
  }

  if (ctype.includes("text/csv") || ctype.includes("application/pdf")) {
    return res.blob();
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return raw ? text : data;
}

// Trigger a browser download for a Blob returned by an export endpoint.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: (p, opts) => request(p, { method: "GET", ...opts }),
  post: (p, body, opts) => request(p, { method: "POST", body, ...opts }),
  put: (p, body, opts) => request(p, { method: "PUT", body, ...opts }),
  del: (p, opts) => request(p, { method: "DELETE", ...opts }),
  postRaw: (p, text, contentType = "text/csv") =>
    fetch(p, {
      method: "POST",
      headers: { "Content-Type": contentType, Authorization: `Bearer ${storage.getToken()}` },
      body: text,
    }).then((res) => (res.ok ? res.json() : res.json().then((d) => Promise.reject(new ApiError(d.error || "Request failed", res.status, d))))),
};

// Build a query string from a params object, skipping empty values.
function qs(params) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

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
// list() returns { rows, page, limit, total }. Pass { page, limit, q, ... }
// for paginated/filterable access; omit for a default page.
export const employeesApi = {
  list: (params) => api.get("/api/employees" + qs(params)).then((d) => d.rows ?? d),
  listPage: (params) => api.get("/api/employees" + qs(params)),
  create: (payload) => api.post("/api/employees", payload),
  update: (id, payload) => api.put(`/api/employees/${id}`, payload),
  remove: (id) => api.del(`/api/employees/${id}`),
  bulkImport: (csvText) => api.postRaw("/api/employees/bulk", csvText, "text/csv"),
};

// ---- tasks ------------------------------------------------------------
export const tasksApi = {
  list: (divisionId, params) =>
    api.get("/api/tasks" + qs({ divisionId, ...params })).then((d) => d.rows ?? d),
  create: (payload) => api.post("/api/tasks", payload),
  update: (id, payload) => api.put(`/api/tasks/${id}`, payload),
  remove: (id) => api.del(`/api/tasks/${id}`),
};

// ---- cross-assignments ------------------------------------------------
export const crossApi = {
  list: (params) => api.get("/api/cross-assignments" + qs(params)),
  create: (payload) => api.post("/api/cross-assignments", payload),
};

// ---- daily logs -------------------------------------------------------
export const dailyLogsApi = {
  list: (params) => api.get("/api/daily-logs" + qs(params)).then((d) => d.rows ?? d),
  listPage: (params) => api.get("/api/daily-logs" + qs(params)),
  create: (payload) => api.post("/api/daily-logs", payload),
  update: (id, totalOutput) => api.put(`/api/daily-logs/${id}`, { totalOutput }),
  remove: (id) => api.del(`/api/daily-logs/${id}`),
};

// ---- reports ----------------------------------------------------------
export const reportsApi = {
  daily: (date) => api.get(`/api/reports/daily?date=${encodeURIComponent(date)}`),
  monthly: (month) => api.get(`/api/reports/monthly?month=${encodeURIComponent(month)}`),
  monthlyEmployee: (employeeId, month) =>
    api.get(`/api/reports/monthly/${employeeId}?month=${encodeURIComponent(month)}`),
  myEarnings: (from, to) => api.get("/api/reports/my-earnings" + qs({ from, to })),
  analytics: (from, to) => api.get("/api/reports/analytics" + qs({ from, to })),
  exportMonthlyCsv: (month) => api.get(`/api/reports/monthly.csv?month=${encodeURIComponent(month)}`),
  exportDailyCsv: (date) => api.get(`/api/reports/daily.csv?date=${encodeURIComponent(date)}`),
  payslipPdf: (employeeId, month) =>
    api.get(`/api/reports/payslip.pdf?employeeId=${employeeId}&month=${encodeURIComponent(month)}`),
};

// ---- audit logs -------------------------------------------------------
export const auditApi = {
  list: (params) => api.get("/api/audit-logs" + qs(params)).then((d) => d.rows ?? d),
  listPage: (params) => api.get("/api/audit-logs" + qs(params)),
};

// ---- health -----------------------------------------------------------
export const healthApi = {
  check: () => api.get("/api/health"),
};
