import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import Spinner from "../components/Spinner";
import styles from "./Auth.module.css";

export default function Signup() {
  const { signup, loginWithGoogle } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setError(""); setLoading(true);
    try {
      await signup(email, password, name);
      navigate("/dashboard");
    } catch (err) {
      const code = err.code || "";
      if (code.includes("email-already-in-use")) setError("An account with this email already exists.");
      else if (code.includes("invalid-email")) setError("Please enter a valid email.");
      else if (code.includes("weak-password")) setError("Password too weak. Try a longer one.");
      else setError("Sign up failed. Try again.");
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
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.sub}>Free forever. No credit card needed.</p>

        {error && <div className={styles.error}><i className="ti ti-alert-circle" />{error}</div>}

        <button className={styles.googleBtn} onClick={handleGoogle} disabled={loading}>
          <i className="ti ti-brand-google" />
          Continue with Google
        </button>

        <div className={styles.divider}><span>or</span></div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name" autoComplete="name" required autoFocus />
          </div>
          <div className={styles.field}>
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required />
          </div>
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label>Password</label>
              <button type="button" className={styles.fieldToggle} onClick={() => setShowPw(s => !s)}>
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            <input type={showPw ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters"
              autoComplete="new-password" required minLength={6} />
          </div>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? <Spinner /> : "Create account"}
          </button>
        </form>

        <p className={styles.terms}>
          By signing up, you agree to our Terms of Service and Privacy Policy.
        </p>

        <p className={styles.switch}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}