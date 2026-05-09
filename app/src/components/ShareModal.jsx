import { useState, useEffect } from "react";
import { doc, updateDoc, collection, query, where, getDocs, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

export default function ShareModal({ board, onClose }) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const isOwner = board.ownerId === user.uid;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const memberIds = board.members || [];
        const docs = await Promise.all(memberIds.map(id => getDoc(doc(db, "users", id))));
        if (cancelled) return;
        setMembers(docs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [board.members]);

  async function handleInvite(e) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    if (trimmed === user.email.toLowerCase()) { setError("You're already a member."); return; }
    setError(""); setSuccess(""); setInviting(true);
    try {
      const q = query(collection(db, "users"), where("email", "==", trimmed));
      const snap = await getDocs(q);
      if (snap.empty) { setError("No FileWeb user with that email."); setInviting(false); return; }
      const targetUser = snap.docs[0];
      const targetId = targetUser.id;
      if ((board.members || []).includes(targetId)) { setError("Already a member."); setInviting(false); return; }
      await updateDoc(doc(db, "boards", board.id), { members: [...(board.members || []), targetId] });
      setMembers(prev => [...prev, { id: targetId, ...targetUser.data() }]);
      setSuccess(`Added ${targetUser.data().displayName || trimmed}`);
      setEmail("");
    } catch (e) { console.error(e); setError("Failed to invite."); }
    setInviting(false);
  }

  async function handleRemove(memberId) {
    if (memberId === board.ownerId) return;
    if (!confirm("Remove this member?")) return;
    try {
      await updateDoc(doc(db, "boards", board.id), { members: (board.members || []).filter(m => m !== memberId) });
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setSuccess("Removed");
    } catch { setError("Failed to remove."); }
  }

  const S = {
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" },
    modal: { width: "100%", maxWidth: "460px", padding: "24px", borderRadius: "16px", border: "0.5px solid var(--bd-s)", background: "var(--bg-2)", boxShadow: "0 12px 32px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: "16px", maxHeight: "85vh", overflowY: "auto" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
    label: { fontSize: "10px", color: "var(--tx-s)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, marginBottom: "4px" },
    title: { fontSize: "18px", fontWeight: 600, color: "var(--tx)" },
    closeBtn: { width: "28px", height: "28px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-m)", fontSize: "16px", background: "transparent", border: "none", cursor: "pointer", padding: 0 },
    inviteRow: { display: "flex", gap: "8px" },
    inviteInputWrap: { flex: 1, display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", borderRadius: "9px", border: "0.5px solid var(--bd)", background: "var(--surf)" },
    input: { flex: 1, padding: "10px 0", border: "none", outline: "none", background: "none", fontSize: "13px", color: "var(--tx)", fontFamily: "inherit" },
    inviteBtn: { padding: "10px 18px", borderRadius: "9px", fontSize: "13px", fontWeight: 500, background: "var(--accent)", color: "#fff", border: "none", minWidth: "84px", minHeight: "38px", cursor: "pointer" },
    error: { display: "flex", alignItems: "center", gap: "7px", padding: "10px 14px", borderRadius: "9px", fontSize: "12px", background: "var(--red-bg)", color: "var(--red)", border: "0.5px solid rgba(244,131,107,0.25)" },
    success: { display: "flex", alignItems: "center", gap: "7px", padding: "10px 14px", borderRadius: "9px", fontSize: "12px", background: "rgba(16,185,129,0.1)", color: "rgb(40,200,140)", border: "0.5px solid rgba(16,185,129,0.25)" },
    sectionTitle: { fontSize: "11px", color: "var(--tx-s)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" },
    member: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "9px", background: "var(--surf)", border: "0.5px solid var(--bd)" },
    avatar: { width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 600, flexShrink: 0, background: "var(--accent-bg)", color: "var(--accent)" },
    badge: { fontSize: "10px", fontWeight: 500, padding: "3px 9px", borderRadius: "12px", flexShrink: 0 },
    removeBtn: { width: "26px", height: "26px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-s)", fontSize: "13px", background: "transparent", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 },
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <div>
            <div style={S.label}>Share</div>
            <h2 style={S.title}>{board.name}</h2>
          </div>
          <button style={S.closeBtn} onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        {isOwner ? (
          <form onSubmit={handleInvite} style={S.inviteRow}>
            <div style={S.inviteInputWrap}>
              <i className="ti ti-mail" style={{ fontSize: "14px", color: "var(--tx-s)" }} />
              <input type="email" placeholder="Invite by email..." value={email}
                onChange={e => setEmail(e.target.value)} disabled={inviting} required autoFocus style={S.input} />
            </div>
            <button type="submit" style={{ ...S.inviteBtn, opacity: (inviting || !email.trim()) ? 0.5 : 1 }} disabled={inviting || !email.trim()}>
              {inviting ? "..." : "Invite"}
            </button>
          </form>
        ) : (
          <div style={{ padding: "10px 14px", borderRadius: "9px", background: "var(--surf)", color: "var(--tx-m)", fontSize: "12px" }}>
            Only the owner can manage members.
          </div>
        )}

        {error && <div style={S.error}><i className="ti ti-alert-circle" /> {error}</div>}
        {success && <div style={S.success}><i className="ti ti-check" /> {success}</div>}

        <div style={S.sectionTitle}>People with access ({members.length})</div>

        {loading ? (
          <div style={{ color: "var(--tx-m)", fontSize: "12px", padding: "16px", textAlign: "center" }}>Loading...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {members.map(m => {
              const isMemberOwner = m.id === board.ownerId;
              const isMe = m.id === user.uid;
              const initials = (m.displayName || m.email || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <div key={m.id} style={S.member}>
                  {m.photoURL ? <img src={m.photoURL} alt="" style={{ ...S.avatar, objectFit: "cover" }} /> : <div style={S.avatar}>{initials}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--tx)" }}>
                      {m.displayName || "User"} {isMe && <span style={{ fontSize: "9px", marginLeft: "6px", color: "var(--accent)" }}>(you)</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--tx-s)" }}>{m.email}</div>
                  </div>
                  <span style={{ ...S.badge, background: isMemberOwner ? "var(--accent-bg)" : "var(--surf-h)", color: isMemberOwner ? "var(--accent)" : "var(--tx-m)", border: `0.5px solid ${isMemberOwner ? "var(--accent-bd)" : "var(--bd)"}` }}>
                    {isMemberOwner ? "Owner" : "Member"}
                  </span>
                  {isOwner && !isMemberOwner && (
                    <button style={S.removeBtn} onClick={() => handleRemove(m.id)} title="Remove"><i className="ti ti-x" /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}