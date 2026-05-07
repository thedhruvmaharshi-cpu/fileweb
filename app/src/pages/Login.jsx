import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import Spinner from "../components/Spinner";
import styles from "./Auth.module.css";

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      const code = err.code || "";
      if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
        setError("Invalid email or password.");
      } else if (code.includes("too-many-requests")) {
        setError("Too many attempts. Try again in a moment.");
      } else {
        setError("Something went wrong. Try again.");
      }
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError(""); setLoading(true);
    try {
      await loginWithGoogle();
      navigate("/dashboard");
    } catch {
      setError("Google sign-in failed. Try again.");
    }
    setLoading(false);
  }

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.backLink}>
        <i className="ti ti-arrow-left" /> Back
      </Link>
      <button className={styles.themeBtn} onClick={toggleTheme} aria-label="Toggle theme">
        <i className={`ti ti-${theme === "dark" ? "sun" : "moon"}`} />
      </button>

      <div className={styles.card}>
        <Link to="/" className={styles.logo}>
          <div className={styles.logoIcon} />
          FileWeb
        </Link>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.sub}>Sign in to your account</p>

        {error && <div className={styles.error}><i className="ti ti-alert-circle" />{error}</div>}

        <button className={styles.googleBtn} onClick={handleGoogle} disabled={loading}>
          <i className="ti ti-brand-google" />
          Continue with Google
        </button>

        <div className={styles.divider}><span>or</span></div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required autoFocus />
          </div>
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label>Password</label>
              <button type="button" className={styles.fieldToggle} onClick={() => setShowPw(s => !s)}>
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            <input type={showPw ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              autoComplete="current-password" required />
          </div>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? <Spinner /> : "Sign in"}
          </button>
        </form>

        <p className={styles.switch}>
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}