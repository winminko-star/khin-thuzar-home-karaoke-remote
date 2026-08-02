import { useEffect, useState } from "react";

const SESSION_URL = "/api/auth/session";
const LOGIN_URL = "/api/auth/login";

export default function PasswordGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    fetch(SESSION_URL, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));

        if (active) {
          setAuthenticated(Boolean(response.ok && data.authenticated));
        }
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!password || submitting) return;

    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ password })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.authenticated) {
        setMessage(data.message || "Password မမှန်ပါ။");
        setPassword("");
        return;
      }

      setAuthenticated(true);
      setPassword("");
    } catch {
      setMessage("Login server ကို ဆက်သွယ်မရပါ။");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="password-gate">
        <section className="password-card password-card-loading">
          <img
            src="/logo.png"
            alt="Khin Thuzar Hlaing"
            className="password-logo"
          />
          <div className="password-spinner" />
          <p>Checking access…</p>
        </section>
      </main>
    );
  }

  async function handleLogout() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include"
  });

  setAuthenticated(false);
}

if (authenticated) {
  return (
    <>
      <button
        type="button"
        className="logout-button"
        onClick={handleLogout}
      >
        Logout
      </button>

      {children}
    </>
  );
}

  return (
    <main className="password-gate">
      <section className="password-card">
        <div className="password-logo-frame">
          <img
            src="/logo.png"
            alt="Khin Thuzar Hlaing"
            className="password-logo"
          />
        </div>

        <p className="password-eyebrow">KHIN THUZAR HLAING&apos;S</p>
        <h1>HOME KARAOKE 🎤</h1>
        <p className="password-subtitle">Remote Control</p>

        <form onSubmit={handleSubmit} className="password-form">
          <label htmlFor="remote-password">Password</label>

          <input
            id="remote-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password ရိုက်ပါ"
            autoComplete="current-password"
            autoFocus
            disabled={submitting}
          />

          {message && <div className="password-error">{message}</div>}

          <button type="submit" disabled={!password || submitting}>
            {submitting ? "Checking…" : "Enter Remote"}
          </button>
        </form>

        <small>Authorized users only</small>
      </section>
    </main>
  );
}
