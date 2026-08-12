import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { FullScreenLoader } from "./components/Loaders.jsx";
import Layout from "./components/Layout.jsx";
import { RequireAuth } from "./components/ProtectedRoute.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import EarningsPage from "./pages/EarningsPage.jsx";
import DailyLogsPage from "./pages/DailyLogsPage.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import EmployeesPage from "./pages/EmployeesPage.jsx";
import CrossAssignmentsPage from "./pages/CrossAssignmentsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import AuditPage from "./pages/AuditPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

function AppRoutes() {
  const { user, booting } = useAuth();

  if (booting) return <FullScreenLoader />;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/earnings" element={<RequireAuth roles={["employee", "super_admin"]}><EarningsPage /></RequireAuth>} />
        <Route path="/daily-logs" element={<RequireAuth roles={["supervisor"]}><DailyLogsPage /></RequireAuth>} />
        <Route path="/tasks" element={<RequireAuth roles={["admin"]}><TasksPage /></RequireAuth>} />
        <Route path="/employees" element={<RequireAuth roles={["hr", "admin"]}><EmployeesPage /></RequireAuth>} />
        <Route path="/cross-assignments" element={<RequireAuth roles={["hr"]}><CrossAssignmentsPage /></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth roles={["hr", "admin"]}><ReportsPage /></RequireAuth>} />
        <Route path="/audit" element={<RequireAuth roles={["super_admin"]}><AuditPage /></RequireAuth>} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return <AppRoutes />;
}
