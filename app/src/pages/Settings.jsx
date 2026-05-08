import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection, query, where, onSnapshot, doc, setDoc, updateDoc,
  deleteDoc, serverTimestamp, addDoc, getDocs
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import Spinner from "../components/Spinner";
import {
  initDriveAuth, requestDriveAccess, listFolders, listFilesInFolder,
  mimeToType, formatBytes, clearAccessToken
} from "../lib/drive";
import styles from "./Settings.module.css";

export default function Settings() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [discordServers, setDiscordServers] = useState([]);
  const [linkCode, setLinkCode] = useState(null);
  const [generating, setGenerating] = useState(false);

  const [driveFolders, setDriveFolders] = useState([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [availableFolders, setAvailableFolders] = useState([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState(new Set());
  const [syncing, setSyncing] = useState(null);

  const [boards, setBoards] = useState([]);
  const [toast, setToast] = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 1800); };

  // Load Discord servers
  useEffect(() => {
    const q = query(collection(db, "discordServers"), where("ownerId", "==", user.uid));
    return onSnapshot(q, snap => {
      setDiscordServers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user.uid]);

  // Load Drive folders
  useEffect(() => {
    const q = query(collection(db, "driveConnections"), where("userId", "==", user.uid));
    return onSnapshot(q, snap => {
      setDriveFolders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user.uid]);

  // Load boards
  useEffect(() => {
    const q = query(collection(db, "boards"), where("members", "array-contains", user.uid));
    return onSnapshot(q, snap => {
      setBoards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user.uid]);

  // ────── Discord ──────
  async function generateLinkCode() {
    setGenerating(true);
    try {
      const code = "FW-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      await setDoc(doc(db, "linkCodes", code), {
        userId: user.uid,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: serverTimestamp(),
      });
      setLinkCode(code);
    } catch (e) { showToast("Failed to generate code"); }
    setGenerating(false);
  }

  async function disconnectDiscord(serverId) {
    if (!confirm("Disconnect this Discord server? Existing files will stay on your boards.")) return;
    try {
      await updateDoc(doc(db, "discordServers", serverId), { linked: false });
      showToast("Server disconnected");
    } catch { showToast("Failed to disconnect"); }
  }

  const discordInviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${import.meta.env.VITE_DISCORD_CLIENT_ID}&permissions=66560&scope=bot%20applications.commands`;

  // ────── Drive ──────
  async function startDriveConnect() {
    setDriveError("");
    setDriveLoading(true);
    try {
      await initDriveAuth();
      await requestDriveAccess();
      const folders = await listFolders();
      setAvailableFolders(folders.sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedFolderIds(new Set());
      setFolderPickerOpen(true);
    } catch (e) {
      setDriveError(e.message || "Failed to connect Drive");
    }
    setDriveLoading(false);
  }

  async function confirmFolderSelection() {
    if (selectedFolderIds.size === 0) {
      setFolderPickerOpen(false);
      return;
    }
    const userBoard = boards.find(b => b.isInbox)?.id;
    if (!userBoard) { showToast("No default board"); return; }

    const existingFolderIds = new Set(driveFolders.map(d => d.folderId));
    const now = new Date().toISOString();

    let added = 0;
    for (const fId of selectedFolderIds) {
      if (existingFolderIds.has(fId)) continue;
      const folder = availableFolders.find(f => f.id === fId);
      if (!folder) continue;
      await addDoc(collection(db, "driveConnections"), {
        userId: user.uid,
        folderId: folder.id,
        folderName: folder.name,
        defaultBoardId: userBoard,
        lastSyncedAt: now,
        linkedAt: serverTimestamp(),
        active: true,
      });
      added++;
    }
    setFolderPickerOpen(false);
    showToast(`${added} folder${added !== 1 ? "s" : ""} connected — syncing...`);

    // Auto-sync newly connected folders
    setTimeout(async () => {
      const fresh = await getDocs(query(collection(db, "driveConnections"), where("userId", "==", user.uid)));
      const newConns = fresh.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(c => selectedFolderIds.has(c.folderId));
      for (const c of newConns) {
        await syncDriveFolder(c);
      }
    }, 500);
  }

  async function disconnectDriveFolder(connectionId) {
    if (!confirm("Disconnect this folder? Existing files stay on your boards.")) return;
    try {
      await deleteDoc(doc(db, "driveConnections", connectionId));
      showToast("Folder disconnected");
    } catch { showToast("Failed to disconnect"); }
  }

  async function syncDriveFolder(connection) {
    setSyncing(connection.id);
    try {
      // Need fresh access token
      await initDriveAuth();
      await requestDriveAccess();
      const files = await listFilesInFolder(connection.folderId);
      let added = 0;
      for (const f of files) {
        const itemId = `drive_${f.id}`;
        await setDoc(doc(db, "boards", connection.defaultBoardId, "items", itemId), {
          type: mimeToType(f.mimeType),
          name: f.name,
          sender: f.owners?.[0]?.displayName || "Drive",
          source: "drive",
          sourceFileId: f.id,
          attachmentUrl: f.webViewLink,
          mimeType: f.mimeType,
          size: formatBytes(f.size),
          sizeBytes: Number(f.size) || 0,
          timestamp: f.modifiedTime,
          x: 100 + Math.random() * 600,
          y: 100 + Math.random() * 400,
          connectedTo: [],
          ownerId: user.uid,
          addedBy: "drive",
        }, { merge: true });
        added++;
      }
      await updateDoc(doc(db, "driveConnections", connection.id), { lastSyncedAt: new Date().toISOString() });
      showToast(`${added} new file${added !== 1 ? "s" : ""} synced`);
    } catch (e) {
      showToast("Sync failed: " + (e.message || "unknown"));
    }
    setSyncing(null);
  }

  // ────── Render ──────
  const initials = (user.displayName || user.email || "U").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Link to="/dashboard" className={styles.sidebarLogo}>
          <div className={styles.logoIcon} />
          FileWeb
        </Link>

        <nav className={styles.nav}>
          <Link to="/dashboard" className={styles.navItem}>
            <i className="ti ti-arrow-left" /> Back to dashboard
          </Link>
          <div className={styles.navLabel}>Settings</div>
          <button className={`${styles.navItem} ${styles.active}`}>
            <i className="ti ti-plug" /> Connections
          </button>
          <button className={styles.navItem}>
            <i className="ti ti-user" /> Account
          </button>
        </nav>

        <div className={styles.sidebarBottom}>
          <button className={styles.navItem} onClick={toggleTheme}>
            <i className={`ti ti-${theme === "dark" ? "sun" : "moon"}`} />
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button className={styles.navItem} onClick={logout}>
            <i className="ti ti-logout" /> Sign out
          </button>
          <div className={styles.userRow}>
            {user.photoURL ? <img src={user.photoURL} className={styles.avatarImg} alt="" /> : <div className={styles.avatar}>{initials}</div>}
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user.displayName}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Connections</h1>
          <p className={styles.sub}>Connect your file sources. New files appear on your Inbox board.</p>
        </div>

        {/* Discord Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sourceLogo} style={{ background: "rgba(88,101,242,0.15)", color: "#5865F2" }}>
              <i className="ti ti-brand-discord" />
            </div>
            <div className={styles.sourceInfo}>
              <div className={styles.sourceName}>Discord</div>
              <div className={styles.sourceDesc}>Pull files from your Discord servers</div>
            </div>
            <button className={styles.connectBtn} onClick={generateLinkCode} disabled={generating}>
              {generating ? <Spinner /> : <><i className="ti ti-plus" /> Connect server</>}
            </button>
          </div>

          {linkCode && (
            <div className={styles.codeBox}>
              <div className={styles.codeBoxTitle}>Your link code</div>
              <div className={styles.codeRow}>
                <code className={styles.code}>{linkCode}</code>
                <button className={styles.codeBtn} onClick={() => { navigator.clipboard.writeText(linkCode); showToast("Copied"); }}>
                  <i className="ti ti-copy" /> Copy
                </button>
              </div>
              <div className={styles.codeSteps}>
                <div className={styles.codeStep}>
                  <span className={styles.stepNum}>1</span>
                  <a href={discordInviteUrl} target="_blank" rel="noreferrer" className={styles.stepLink}>
                    Invite the bot to your server <i className="ti ti-external-link" />
                  </a>
                </div>
                <div className={styles.codeStep}>
                  <span className={styles.stepNum}>2</span>
                  In your Discord server, run <code className={styles.inlineCode}>/link code:{linkCode}</code>
                </div>
                <div className={styles.codeStep}>
                  <span className={styles.stepNum}>3</span>
                  Files will appear on your Inbox board
                </div>
              </div>
              <button className={styles.codeDismiss} onClick={() => setLinkCode(null)}>Done</button>
            </div>
          )}

          <div className={styles.connList}>
            {discordServers.length === 0 ? (
              <div className={styles.emptyConn}>No Discord servers connected yet.</div>
            ) : (
              discordServers.map(s => (
                <div key={s.id} className={styles.connItem}>
                  <div className={styles.connIcon} style={{ background: "rgba(88,101,242,0.15)", color: "#5865F2" }}>
                    <i className="ti ti-brand-discord" />
                  </div>
                  <div className={styles.connInfo}>
                    <div className={styles.connName}>{s.guildName}</div>
                    <div className={styles.connMeta}>
                      {s.linked ? (
                        <><span className={styles.connDot} /> Active · {s.selectedChannels?.length || 0} channels</>
                      ) : (
                        <><span className={styles.connDotInactive} /> Disconnected</>
                      )}
                    </div>
                  </div>
                  {s.linked && (
                    <button className={styles.connAction} onClick={() => disconnectDiscord(s.id)}>
                      Disconnect
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Drive Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sourceLogo} style={{ background: "rgba(78,205,196,0.15)", color: "#4ECDC4" }}>
              <i className="ti ti-brand-google-drive" />
            </div>
            <div className={styles.sourceInfo}>
              <div className={styles.sourceName}>Google Drive</div>
              <div className={styles.sourceDesc}>Pick folders to sync. New files going forward appear on your boards.</div>
            </div>
            <button className={styles.connectBtn} onClick={startDriveConnect} disabled={driveLoading}>
              {driveLoading ? <Spinner /> : <><i className="ti ti-plus" /> Connect folders</>}
            </button>
          </div>

          {driveError && <div className={styles.error}><i className="ti ti-alert-circle" /> {driveError}</div>}

          <div className={styles.connList}>
            {driveFolders.length === 0 ? (
              <div className={styles.emptyConn}>No Drive folders connected yet.</div>
            ) : (
              driveFolders.map(f => (
                <div key={f.id} className={styles.connItem}>
                  <div className={styles.connIcon} style={{ background: "rgba(78,205,196,0.15)", color: "#4ECDC4" }}>
                    <i className="ti ti-folder" />
                  </div>
                  <div className={styles.connInfo}>
                    <div className={styles.connName}>{f.folderName}</div>
                    <div className={styles.connMeta}>
                      <span className={styles.connDot} /> Active · last sync {f.lastSyncedAt ? new Date(f.lastSyncedAt).toLocaleDateString() : "never"}
                    </div>
                  </div>
                  <button className={styles.connAction} onClick={() => syncDriveFolder(f)} disabled={syncing === f.id}>
                    {syncing === f.id ? <Spinner /> : <><i className="ti ti-refresh" /> Sync now</>}
                  </button>
                  <button className={styles.connAction} onClick={() => disconnectDriveFolder(f.id)}>
                    Disconnect
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Drive folder picker modal */}
      {folderPickerOpen && (
        <div className={styles.overlay} onClick={() => setFolderPickerOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Pick folders to sync</h2>
              <button className={styles.modalClose} onClick={() => setFolderPickerOpen(false)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div className={styles.modalSub}>Select one or more folders. We'll watch them for new files going forward.</div>

            <div className={styles.folderList}>
              {availableFolders.length === 0 ? (
                <div className={styles.emptyConn}>No folders found in your Drive.</div>
              ) : (
                availableFolders.map(f => (
                  <label key={f.id} className={styles.folderItem}>
                    <input type="checkbox" checked={selectedFolderIds.has(f.id)}
                      onChange={(e) => {
                        const next = new Set(selectedFolderIds);
                        if (e.target.checked) next.add(f.id); else next.delete(f.id);
                        setSelectedFolderIds(next);
                      }} />
                    <i className="ti ti-folder" />
                    <span>{f.name}</span>
                  </label>
                ))
              )}
            </div>

            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setFolderPickerOpen(false)}>Cancel</button>
              <button className={styles.confirmBtn} onClick={confirmFolderSelection} disabled={selectedFolderIds.size === 0}>
                Add {selectedFolderIds.size} folder{selectedFolderIds.size !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}