import React, { createContext, useContext, useCallback, useMemo, useEffect, useState } from "react";
import { authApi, storage, setUnauthorizedHandler } from "../api/client";
import { healthApi } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => storage.getUser());
  const [booting, setBooting] = useState(true);
  const [backendUp, setBackendUp] = useState(true);

  // On first load, verify a stored token is still valid via /api/auth/me.
  useEffect(() => {
    let active = true;
    const token = storage.getToken();
    setUnauthorizedHandler(() => logout());
    if (!token) {
      setBooting(false);
      return;
    }
    authApi
      .me()
      .then(({ user: u }) => { if (active) { setUser(u); storage.setUser(u); } })
      .catch(() => { storage.clearToken(); if (active) setUser(null); })
      .finally(() => { if (active) setBooting(false); });
    return () => { active = false; };
  }, []);

  // Lightweight backend reachability ping shown in the topbar.
  useEffect(() => {
    let active = true;
    const ping = () => healthApi.check().then(() => active && setBackendUp(true)).catch(() => active && setBackendUp(false));
    ping();
    const id = setInterval(ping, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const login = useCallback(async (code, password) => {
    const { token, user: u } = await authApi.login(code, password);
    storage.setToken(token);
    storage.setUser(u);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    storage.clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, booting, backendUp, setUser }),
    [user, login, logout, booting, backendUp]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
