// Shared formatting + small role helpers.

export const ROLE_LABELS = {
  employee: "Employee",
  supervisor: "Supervisor",
  hr: "HR",
  admin: "Admin",
  super_admin: "Super Admin",
};

export const ROLE_ORDER = ["super_admin", "admin", "hr", "supervisor", "employee"];

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export function roleColor(role) {
  return `var(--role-${role})`;
}

// super_admin passes every role gate (mirrors backend requireRole).
export function hasRole(user, ...roles) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  return roles.includes(user.role);
}

export function formatMoney(n, currency = "Rs.") {
  const v = Number(n || 0);
  return `${currency} ${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDateTime(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function currentMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() || "").join("") || "?";
}

// Task type metadata used across the UI.
export const TASK_TYPES = {
  1: { label: "Individual Flat Rate", short: "Type 1", color: "var(--pussalla-green-600)" },
  2: { label: "Group Flat-Rate Pool", short: "Type 2", color: "var(--pussalla-gold-600)" },
  3: { label: "Group Daily Limit / Tiered", short: "Type 3", color: "var(--info)" },
};

export function taskTypeLabel(t) {
  return TASK_TYPES[t]?.label || `Type ${t}`;
}

// Frontend mirror of utils/calcEngine.js so supervisors see a live preview
// before submitting. The backend remains the source of truth.
export function calcEngine(task, totalOutput, workerCount) {
  const output = Number(totalOutput);
  const rate = Number(task.rate);
  if (task.task_type === 1) {
    const total = output * rate;
    return { total, perWorker: total };
  }
  if (task.task_type === 2) {
    const total = output * rate;
    return { total, perWorker: workerCount > 0 ? total / workerCount : 0 };
  }
  if (task.task_type === 3) {
    const excess = Math.max(0, output - Number(task.base_limit));
    const total = excess * rate;
    return { total, perWorker: workerCount > 0 ? total / workerCount : 0 };
  }
  return { total: 0, perWorker: 0 };
}

export function downloadCsv(filename, rows) {
  const csv = rows
    .map((r) => r.map((c) => {
      const s = c == null ? "" : String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
