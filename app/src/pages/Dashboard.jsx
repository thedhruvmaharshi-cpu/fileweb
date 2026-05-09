import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import Spinner from "../components/Spinner";
import styles from "./Dashboard.module.css";
import ShareModal from "../components/ShareModal";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [shareBoard, setShareBoard] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "boards"), where("members", "array-contains", user.uid));
    return onSnapshot(q, snap => {
      setBoards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [user]);

  async function createBoard(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await addDoc(collection(db, "boards"), {
        name: newName.trim(),
        ownerId: user.uid,
        members: [user.uid],
        isInbox: false,
        createdAt: serverTimestamp(),
      });
      setNewName(""); setShowNew(false);
    } finally { setCreating(false); }
  }

  const initials = (user.displayName || user.email || "U").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const filteredBoards = boards
    .filter(b => !search || b.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.isInbox ? 1 : 0) - (a.isInbox ? 1 : 0));

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.sidebarLogo}>
            <div className={styles.logoIcon} />
            FileWeb
          </div>

          <button className={styles.newBtn} onClick={() => setShowNew(true)}>
            <i className="ti ti-plus" />
            New board
            <span className={styles.kbd}>⌘N</span>
          </button>

          <nav className={styles.nav}>
            <div className={styles.navLabel}>Workspace</div>
            <button className={`${styles.navItem} ${styles.active}`}>
              <i className="ti ti-layout-grid" />
              All boards
              <span className={styles.count}>{boards.length}</span>
            </button>
            <button className={styles.navItem}>
              <i className="ti ti-users" />
              Shared with me
            </button>
            <button className={styles.navItem}>
              <i className="ti ti-clock" />
              Recent
            </button>

            <div className={styles.navLabel} style={{ marginTop: 16 }}>Connections</div>
             <button className={styles.navItem} onClick={() => navigate("/settings")}>
  <i className="ti ti-brand-discord" />
  Discord
             </button>
             <button className={styles.navItem} onClick={() => navigate("/settings")}>
  <i className="ti ti-brand-google-drive" />
  Google Drive
            </button>
          </nav>
        </div>

        <div className={styles.sidebarBottom}>
          <button className={styles.navItem} onClick={toggleTheme}>
            <i className={`ti ti-${theme === "dark" ? "sun" : "moon"}`} />
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button className={styles.navItem} onClick={logout}>
            <i className="ti ti-logout" />
            Sign out
          </button>
          <div className={styles.userRow}>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className={styles.avatarImg} />
            ) : (
              <div className={styles.avatar}>{initials}</div>
            )}
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user.displayName || "User"}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.mainHeader}>
          <div>
            <h1 className={styles.mainTitle}>Your boards</h1>
            <p className={styles.mainSub}>
              {boards.length === 0 ? "Get started by creating your first board" : `${boards.length} board${boards.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className={styles.mainActions}>
            <div className={styles.searchBox}>
              <i className="ti ti-search" />
              <input
                type="text" placeholder="Search boards..."
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className={styles.newBtnTop} onClick={() => setShowNew(true)}>
              <i className="ti ti-plus" /> New board
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingState}>
            <Spinner size={20} />
            <span>Loading your boards...</span>
          </div>
        ) : filteredBoards.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <i className="ti ti-layout-grid-add" />
            </div>
            <div className={styles.emptyTitle}>
              {search ? "No matching boards" : "No boards yet"}
            </div>
            <div className={styles.emptySub}>
              {search ? "Try a different search term" : "Create your first board to get started"}
            </div>
            {!search && (
              <button className={styles.emptyBtn} onClick={() => setShowNew(true)}>
                <i className="ti ti-plus" /> Create board
              </button>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
{filteredBoards.map(board => (
  <div
    key={board.id}
    className={styles.boardCard}
    onClick={() => navigate(`/board/${board.id}`)}
    style={{ cursor: "pointer", position: "relative" }}
  >
    <button
      onClick={(e) => { e.stopPropagation(); setShareBoard(board); }}
      title="Share"
      style={{
        position: "absolute",
        top: "12px",
        right: "12px",
        width: "30px",
        height: "30px",
        borderRadius: "8px",
        background: "var(--surf)",
        color: "var(--tx-m)",
        fontSize: "14px",
        border: "0.5px solid var(--bd)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        zIndex: 5,
      }}
    >
      <i className="ti ti-user-plus" />
    </button>
    <div className={styles.boardCardTop}>
      <div className={`${styles.boardIcon} ${board.isInbox ? styles.boardIconInbox : ""}`}>
        <i className={`ti ${board.isInbox ? "ti-inbox" : "ti-layout-kanban"}`} />
      </div>
      {board.isInbox && <span className={styles.badge} style={{ marginRight: "36px" }}>Inbox</span>}
    </div>
    <div className={styles.boardName}>{board.name}</div>
    <div className={styles.boardMeta}>
      <span><i className="ti ti-users" /> {board.members?.length || 1}</span>
      <span><i className="ti ti-circle-dot" /> {board.ownerId === user.uid ? "Owner" : "Member"}</span>
    </div>
  </div>
))}
          </div>
        )}
      </main>

      {showNew && (
        <div className={styles.overlay} onClick={() => setShowNew(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Create a new board</h2>
              <button className={styles.modalClose} onClick={() => setShowNew(false)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <form onSubmit={createBoard} className={styles.modalForm}>
              <div className={styles.modalField}>
                <label>Board name</label>
                <input
                  type="text" placeholder="e.g. Design assets, Research, Q4 Planning..."
                  value={newName} onChange={e => setNewName(e.target.value)} autoFocus required
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className={styles.confirmBtn} disabled={creating || !newName.trim()}>
                  {creating ? <Spinner /> : "Create board"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {shareBoard && <ShareModal board={shareBoard} onClose={() => setShareBoard(null)} />}
    </div>
  );
}