import { Link, useParams } from "react-router-dom";

export default function BoardPlaceholder() {
  const { boardId } = useParams();
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      backgroundImage: "radial-gradient(circle, var(--dot) 1px, transparent 1px)",
      backgroundSize: "28px 28px",
    }}>
      <div style={{
        padding: 40, borderRadius: 16, border: "0.5px solid var(--bd-s)",
        background: "var(--bg-2)", textAlign: "center", maxWidth: 400,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px",
          background: "var(--accent-bg)", color: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
        }}>
          <i className="ti ti-vector-triangle" />
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Canvas coming soon</div>
        <div style={{ fontSize: 13, color: "var(--tx-m)", marginBottom: 8 }}>
          Board ID: <code>{boardId}</code>
        </div>
        <div style={{ fontSize: 12, color: "var(--tx-s)", marginBottom: 20 }}>
          We'll build this in Phase 3.
        </div>
        <Link to="/dashboard" style={{
          display: "inline-flex", gap: 6, padding: "10px 18px", borderRadius: 9,
          fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "#fff",
        }}>
          <i className="ti ti-arrow-left" /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}