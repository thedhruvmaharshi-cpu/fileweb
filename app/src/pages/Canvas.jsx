import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  doc, getDoc, collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import Spinner from "../components/Spinner";
import styles from "./Canvas.module.css";
import ShareModal from "../components/ShareModal";

// ───────────────────────────── Constants ─────────────────────────────

const TYPE_COLORS = {
  document: "232,89,60", code: "108,99,255", image: "78,205,196",
  video: "239,159,39", audio: "239,159,39", archive: "232,89,60",
  spreadsheet: "232,89,60", presentation: "232,89,60", design: "108,99,255",
  other: "160,160,170", person: "139,133,255", channel: "160,160,170",
};

const TYPE_ICONS = {
  document: "ti-file-type-pdf", code: "ti-code", image: "ti-photo",
  video: "ti-video", audio: "ti-music", archive: "ti-file-zip",
  spreadsheet: "ti-file-spreadsheet", presentation: "ti-presentation",
  design: "ti-color-swatch", other: "ti-file",
};

const FILTER_OPTIONS = [
  { id: "all", label: "All" },
  { id: "document", label: "Docs" },
  { id: "image", label: "Images" },
  { id: "code", label: "Code" },
  { id: "video", label: "Video" },
];

const COLOR_OPTIONS = [
  { id: "purple", rgb: "108,99,255", name: "Purple" },
  { id: "teal", rgb: "78,205,196", name: "Teal" },
  { id: "amber", rgb: "239,159,39", name: "Amber" },
  { id: "red", rgb: "232,89,60", name: "Red" },
  { id: "green", rgb: "29,158,117", name: "Green" },
  { id: "pink", rgb: "236,72,153", name: "Pink" },
  { id: "blue", rgb: "59,130,246", name: "Blue" },
  { id: "gray", rgb: "160,160,170", name: "Gray" },
];

const stickyStyleFor = (rgb) => ({
  bg: `rgba(${rgb},0.12)`,
  fg: rgb === "160,160,170" ? "rgba(220,220,225,0.95)" : `rgba(${lighten(rgb)},0.95)`,
  bd: `rgba(${rgb},0.28)`,
  color: rgb,
});

function lighten(rgb) {
  const [r, g, b] = rgb.split(",").map(Number);
  const lr = Math.min(255, r + (255 - r) * 0.4);
  const lg = Math.min(255, g + (255 - g) * 0.4);
  const lb = Math.min(255, b + (255 - b) * 0.4);
  return `${Math.round(lr)},${Math.round(lg)},${Math.round(lb)}`;
}

// ───────────────────────────── Helpers ─────────────────────────────

function edgePoint(box, tx, ty, shape) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  if (shape === "circle") {
    const a = Math.atan2(dy, dx);
    const r = box.w / 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  }
  const hw = box.w / 2, hh = box.h / 2;
  const tan = Math.abs(dy) / (Math.abs(dx) || 0.001);
  let ex, ey;
  if (tan <= hh / hw) {
    ex = dx > 0 ? hw : -hw;
    ey = ex * (dy / (dx || 0.001));
  } else {
    ey = dy > 0 ? hh : -hh;
    ex = ey * (dx / (dy || 0.001));
  }
  return { x: cx + ex, y: cy + ey };
}

function getNodeBox(item) {
  let w = 158, h = 92;
  if (item.type === "person") { w = 50; h = 50; }
  else if (item.type === "channel") { w = 110; h = 30; }
  else if (item.type === "sticky") { w = 144; h = 64; }
  else if (item.type === "text") { w = 110; h = 32; }
  const s = item.scale || 1;
  return { x: item.x, y: item.y, w: w * s, h: h * s };
}

function getShape(item) { return item.type === "person" ? "circle" : "rect"; }

function getColor(item) {
  return item.color || TYPE_COLORS[item.type] || "160,160,170";
}

function timeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 2592000)}mo ago`;
}

// ───────────────────────────── Component ─────────────────────────────

export default function Canvas() {
  const { boardId } = useParams();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [board, setBoard] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingConnId, setEditingConnId] = useState(null);
  const [mode, setMode] = useState("select");
  const [connectFromId, setConnectFromId] = useState(null);
  const [toast, setToast] = useState("");
  const [tick, setTick] = useState(0);

  const canvasRef = useRef(null);
  const localPositionsRef = useRef({});
  const panStateRef = useRef(null);
  const [showShare, setShowShare] = useState(false);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1500);
  }, []);

  // ─── Load board + items ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bDoc = await getDoc(doc(db, "boards", boardId));
        if (!bDoc.exists()) { setError("Board not found"); setLoading(false); return; }
        if (!cancelled) setBoard({ id: bDoc.id, ...bDoc.data() });
      } catch { if (!cancelled) { setError("Failed to load board"); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [boardId]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "boards", boardId, "items"),
      (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => { setError("Failed to load items"); setLoading(false); }
    );
    return unsub;
  }, [boardId]);

  // ─── Auto-connect ───
const autoArrange = async () => {
  const fileType = (i) => i.type !== "person" && i.type !== "channel" && i.type !== "sticky" && i.type !== "text";
  const fileItems = items.filter(fileType);
  const existingPeople = items.filter(i => i.type === "person");

  // Group files by sender
  const groups = {};
  fileItems.forEach(f => {
    const sender = f.sender || "Unknown";
    if (!groups[sender]) groups[sender] = [];
    groups[sender].push(f);
  });

  const senderNames = Object.keys(groups).filter(s => s !== "Unknown");
  if (senderNames.length === 0 && groups["Unknown"]?.length === 0) {
    showToast("Nothing to arrange");
    return;
  }

  const batch = writeBatch(db);
  const COLS = Math.max(2, Math.ceil(Math.sqrt(senderNames.length)));
  const CLUSTER_W = 460;
  const CLUSTER_H = 380;
  const colors = ["108,99,255", "78,205,196", "239,159,39", "232,89,60", "29,158,117", "236,72,153", "59,130,246", "139,133,255"];

  senderNames.forEach((sender, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const cx = 100 + col * CLUSTER_W;
    const cy = 100 + row * CLUSTER_H;

    // Find or create person node for this sender
    let person = existingPeople.find(p => p.name === sender);
    let personId;

    if (person) {
      personId = person.id;
      batch.update(doc(db, "boards", boardId, "items", personId), {
        x: cx, y: cy,
        color: person.color || colors[idx % colors.length],
      });
    } else {
      const newRef = doc(collection(db, "boards", boardId, "items"));
      personId = newRef.id;
      batch.set(newRef, {
        type: "person",
        name: sender,
        color: colors[idx % colors.length],
        x: cx, y: cy,
        connectedTo: [],
        ownerId: user.uid,
        addedBy: "auto-arrange",
        timestamp: new Date().toISOString(),
      });
    }

    // Position files in a grid around the person, connect each to person
    const files = groups[sender];
    const fcols = Math.ceil(Math.sqrt(files.length));
    files.forEach((f, fIdx) => {
      const fCol = fIdx % fcols;
      const fRow = Math.floor(fIdx / fcols);
      const fx = cx + 90 + fCol * 175;
      const fy = cy - 30 + fRow * 115;
      batch.update(doc(db, "boards", boardId, "items", f.id), {
        x: fx, y: fy,
        connectedTo: [personId],
        autoConnected: true,
      });
    });
  });

  // Handle "Unknown" sender files - just lay them out in a grid with no connections
  if (groups["Unknown"]) {
    const startY = 100 + Math.ceil(senderNames.length / COLS) * CLUSTER_H;
    groups["Unknown"].forEach((f, idx) => {
      const c = idx % 5;
      const r = Math.floor(idx / 5);
      batch.update(doc(db, "boards", boardId, "items", f.id), {
        x: 100 + c * 170,
        y: startY + r * 115,
        connectedTo: [],
        autoConnected: true,
      });
    });
  }

  try {
    await batch.commit();
    showToast(`Arranged ${fileItems.length} files into ${senderNames.length} clusters`);
    setViewport({ x: 0, y: 0, scale: 0.7 });
  } catch (e) {
    showToast("Arrange failed");
    console.error(e);
  }
};

  // ─── Wheel zoom ───
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0015;
    setViewport(vp => {
      const nextScale = Math.max(0.25, Math.min(2.5, vp.scale * (1 + delta)));
      const wx = (cx - vp.x) / vp.scale;
      const wy = (cy - vp.y) / vp.scale;
      return { x: cx - wx * nextScale, y: cy - wy * nextScale, scale: nextScale };
    });
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ─── Pan canvas ───
  const handleCanvasMouseDown = (e) => {
    if (e.target !== canvasRef.current && !e.target.classList.contains(styles.dots)) return;
    setSelectedId(null);
    setEditingId(null);
    if (e.button !== 0) return;

    const startX = e.clientX, startY = e.clientY;
    const startVp = { ...viewport };

    const onMove = (ev) => {
      setViewport({ x: startVp.x + (ev.clientX - startX), y: startVp.y + (ev.clientY - startY), scale: startVp.scale });
    };
    const onUp = () => {
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.style.cursor = "grabbing";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ─── Node mousedown (drag + click) ───
  const handleNodeMouseDown = (e, item) => {
    e.stopPropagation();
    if (mode === "connect") {
      handleConnect(item);
      return;
    }
    if (e.target.tagName === "BUTTON") return;
    if (e.target.isContentEditable && document.activeElement === e.target) return;

    if (document.activeElement?.isContentEditable) document.activeElement.blur();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const itemStartX = item.x;
    const itemStartY = item.y;
    const startScale = viewport.scale;
    let moved = false;

    const onMove = (ev) => {
      const totalDx = ev.clientX - startX;
      const totalDy = ev.clientY - startY;
      if (Math.abs(totalDx) > 3 || Math.abs(totalDy) > 3) moved = true;
      localPositionsRef.current[item.id] = {
        x: itemStartX + totalDx / startScale,
        y: itemStartY + totalDy / startScale,
      };
      setTick(t => t + 1);
    };

    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (moved) {
        const pos = localPositionsRef.current[item.id];
        if (pos) {
          try {
            await updateDoc(doc(db, "boards", boardId, "items", item.id), { x: pos.x, y: pos.y });
          } catch (err) { console.warn("Save failed:", err); }
        }
        delete localPositionsRef.current[item.id];
        setTick(t => t + 1);
      } else {
        setSelectedId(item.id);
        setEditingId(null);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ─── Connect tool ───
  const handleConnect = async (item) => {
    if (!connectFromId) {
      setConnectFromId(item.id);
      showToast("Now click target node");
      return;
    }
    if (connectFromId === item.id) {
      setConnectFromId(null); setMode("select"); return;
    }
    const fromItem = items.find(i => i.id === connectFromId);
    const existing = fromItem?.connectedTo || [];
    if (!existing.includes(item.id)) {
      try {
        await updateDoc(doc(db, "boards", boardId, "items", connectFromId), { connectedTo: [...existing, item.id] });
        showToast("Connected");
      } catch { showToast("Failed to connect"); }
    } else {
      showToast("Already connected");
    }
    setConnectFromId(null);
    setMode("select");
  };

  // ─── Add nodes ───
  const getCenterCanvasCoords = () => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (rect.width / 2 - viewport.x) / viewport.scale - 70,
      y: (rect.height / 2 - viewport.y) / viewport.scale - 30,
    };
  };

  const addNote = async () => {
    const pos = getCenterCanvasCoords();
    const c = COLOR_OPTIONS[Math.floor(Math.random() * 4)];
    const s = stickyStyleFor(c.rgb);
    await addDoc(collection(db, "boards", boardId, "items"), {
      type: "sticky", content: "Type here...",
      x: pos.x + (Math.random() - 0.5) * 60,
      y: pos.y + (Math.random() - 0.5) * 60,
      bg: s.bg, fg: s.fg, bd: s.bd, color: s.color,
      connectedTo: [], ownerId: user.uid, addedBy: "user",
      timestamp: new Date().toISOString(),
    });
    showToast("Note added");
  };

  const addText = async () => {
    const pos = getCenterCanvasCoords();
    await addDoc(collection(db, "boards", boardId, "items"), {
      type: "text", content: "Heading",
      x: pos.x + 30, y: pos.y + 30,
      connectedTo: [], ownerId: user.uid, addedBy: "user",
      timestamp: new Date().toISOString(),
    });
    showToast("Text added");
  };

  const addPerson = async () => {
    const name = prompt("Name?", "");
    if (!name) return;
    const pos = getCenterCanvasCoords();
    await addDoc(collection(db, "boards", boardId, "items"), {
      type: "person", name: name.trim(),
      color: "139,133,255",
      x: pos.x + 50, y: pos.y + 30,
      connectedTo: [], ownerId: user.uid, addedBy: "user",
      timestamp: new Date().toISOString(),
    });
    showToast("Person added");
  };

  const addChannel = async () => {
    const name = prompt("Channel name?", "");
    if (!name) return;
    const pos = getCenterCanvasCoords();
    await addDoc(collection(db, "boards", boardId, "items"), {
      type: "channel", name: name.trim().replace(/^#/, ""),
      x: pos.x + 30, y: pos.y + 30,
      connectedTo: [], ownerId: user.uid, addedBy: "user",
      timestamp: new Date().toISOString(),
    });
    showToast("Channel added");
  };

  const deleteItem = async (id) => {
    try {
      await deleteDoc(doc(db, "boards", boardId, "items", id));
      const referrers = items.filter(i => (i.connectedTo || []).includes(id));
      if (referrers.length > 0) {
        const batch = writeBatch(db);
        referrers.forEach(r => {
          batch.update(doc(db, "boards", boardId, "items", r.id), {
            connectedTo: r.connectedTo.filter(c => c !== id),
          });
        });
        await batch.commit();
      }
      setSelectedId(null);
      showToast("Deleted");
    } catch { showToast("Delete failed"); }
  };

  const removeConnection = async (fromId, toId) => {
    const fromItem = items.find(i => i.id === fromId);
    if (!fromItem) return;
    await updateDoc(doc(db, "boards", boardId, "items", fromId), {
      connectedTo: (fromItem.connectedTo || []).filter(c => c !== toId),
    });
    showToast("Connection removed");
  };

const setConnectionColor = async (fromId, toId, rgb) => {
  const fromItem = items.find(i => i.id === fromId);
  if (!fromItem) return;
  const styles = { ...(fromItem.connectionStyles || {}) };
  styles[toId] = { ...(styles[toId] || {}), color: rgb };
  await updateDoc(doc(db, "boards", boardId, "items", fromId), { connectionStyles: styles });
  showToast("Connection color updated");
};

  const updateColor = async (id, item, rgb) => {
    if (item.type === "sticky") {
      const s = stickyStyleFor(rgb);
      await updateDoc(doc(db, "boards", boardId, "items", id), {
        bg: s.bg, fg: s.fg, bd: s.bd, color: rgb,
      });
    } else {
      await updateDoc(doc(db, "boards", boardId, "items", id), { color: rgb });
    }
    showToast("Color updated");
  };

  const updateSize = async (id, scale) => {
  await updateDoc(doc(db, "boards", boardId, "items", id), { scale });
  showToast("Size updated");
};

  // ─── Keyboard ───
  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (document.activeElement?.isContentEditable) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteItem(selectedId);
        e.preventDefault();
      } else if (e.key === "v" || e.key === "V") setMode("select");
      else if (e.key === "c" || e.key === "C") { setMode("connect"); showToast("Click two nodes to connect"); }
      else if (e.key === "n" || e.key === "N") addNote();
      else if (e.key === "Escape") {
        setSelectedId(null); setConnectFromId(null); setMode("select"); setEditingId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, items]);

  const updateContent = async (id, content) => {
    try { await updateDoc(doc(db, "boards", boardId, "items", id), { content }); } catch {}
  };

  // ─── Filters ───
  const itemMatches = (item) => {
    if (search) {
      const q = search.toLowerCase();
      const fields = [item.name, item.sender, item.channel, item.content].filter(Boolean).join(" ").toLowerCase();
      if (!fields.includes(q)) return false;
    }
    if (filter !== "all") {
      const isStructural = ["person", "channel", "sticky", "text"].includes(item.type);
      if (!isStructural && item.type !== filter) return false;
    }
    return true;
  };

  function getRenderedItem(item) {
    const local = localPositionsRef.current[item.id];
    if (local) return { ...item, x: local.x, y: local.y };
    return item;
  }

  // ─── Compute connection paths (FIXED bezier) ───
  const connectionPaths = useMemo(() => {
    const paths = [];
    items.forEach(item => {
      if (!itemMatches(item)) return;
      const targets = item.connectedTo || [];
      if (targets.length === 0) return;
      const renderedFrom = getRenderedItem(item);
      const fromBox = getNodeBox(renderedFrom);
      const fromShape = getShape(item);
      targets.forEach(tid => {
        const t = items.find(i => i.id === tid);
        if (!t || !itemMatches(t)) return;
        const renderedTo = getRenderedItem(t);
        const toBox = getNodeBox(renderedTo);
        const toShape = getShape(t);
        const fromCx = fromBox.x + fromBox.w / 2;
        const fromCy = fromBox.y + fromBox.h / 2;
        const toCx = toBox.x + toBox.w / 2;
        const toCy = toBox.y + toBox.h / 2;
        const f = edgePoint(fromBox, toCx, toCy, fromShape);
        const to = edgePoint(toBox, fromCx, fromCy, toShape);

        // Smart bezier: signed offset, prefers horizontal direction
        const dx = to.x - f.x;
        const dy = to.y - f.y;
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        let c1x, c1y, c2x, c2y;
        if (horizontal) {
          const off = dx * 0.5;
          c1x = f.x + off; c1y = f.y;
          c2x = to.x - off; c2y = to.y;
        } else {
          const off = dy * 0.5;
          c1x = f.x; c1y = f.y + off;
          c2x = to.x; c2y = to.y - off;
        }

        const color = (item.connectionStyles && item.connectionStyles[tid]?.color) || getColor(item);
        const dashed = item.type === "channel";
        paths.push({
          id: `${item.id}->${tid}`,
          d: `M${f.x} ${f.y} C${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`,
          color, dashed,
        });
      });
    });
    return paths;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, filter, tick]);

  // ─── Render ───
  if (loading) {
    return <div className={styles.fullPage}><div className={styles.loadingState}><Spinner size={20} /><span>Loading board...</span></div></div>;
  }
  if (error) {
    return (
      <div className={styles.fullPage}>
        <div className={styles.errorState}>
          <i className="ti ti-alert-circle" style={{ fontSize: 28, marginBottom: 12 }} />
          <div>{error}</div>
          <Link to="/dashboard" className={styles.errorBtn}>Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const selectedItem = items.find(i => i.id === selectedId);
  const showEmpty = items.length === 0;

  return (
    <div className={styles.page}>
      <header className={styles.hud}>
        <div className={styles.hudLeft}>
          <Link to="/dashboard" className={styles.backBtn} title="Back"><i className="ti ti-arrow-left" /></Link>
          <div className={styles.boardTitle}>
            <i className={`ti ${board?.isInbox ? "ti-inbox" : "ti-layout-kanban"}`} />
            {board?.name || "Board"}
          </div>
        </div>
        <div className={styles.hudCenter}>
          <div className={styles.searchBox}>
            <i className="ti ti-search" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." />
            {search && <button className={styles.searchClear} onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
          </div>
          <div className={styles.filters}>
            {FILTER_OPTIONS.map(f => (
              <button key={f.id} className={`${styles.pill} ${filter === f.id ? styles.pillActive : ""}`} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
        </div>
        <div className={styles.hudRight}>
          <button className={styles.shareBtn} onClick={() => setShowShare(true)} title="Share">
            <i className="ti ti-user-plus" /> Share
          </button>
          <button className={styles.iconBtn} onClick={toggleTheme}><i className={`ti ti-${theme === "dark" ? "sun" : "moon"}`} /></button>
        </div>
      </header>

      <div ref={canvasRef} className={`${styles.canvas} ${mode === "connect" ? styles.connectMode : ""}`} onMouseDown={handleCanvasMouseDown}>
        <div className={styles.dots} style={{
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
        }} />

        <div className={styles.content} style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
          <svg className={styles.connections} style={{ overflow: "visible" }}>
            {connectionPaths.map(p => (
              <path key={p.id} d={p.d} fill="none"
                stroke={`rgba(${p.color},${p.dashed ? 0.4 : 0.6})`}
                strokeWidth={p.dashed ? 1.2 : 1.5}
                strokeDasharray={p.dashed ? "5 5" : ""}
                strokeLinecap="round" />
            ))}
          </svg>

          {items.map(item => {
            const r = getRenderedItem(item);
            return (
              <Node
                key={item.id} item={r}
                isVisible={itemMatches(item)}
                isSelected={selectedId === item.id}
                isConnectFrom={connectFromId === item.id}
                isEditing={editingId === item.id}
                onMouseDown={(e) => handleNodeMouseDown(e, r)}
                onStartEdit={() => setEditingId(item.id)}
                onContentChange={(content) => { updateContent(item.id, content); setEditingId(null); }}
              />
            );
          })}
        </div>

        {showEmpty && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><i className="ti ti-vector-triangle" /></div>
            <div className={styles.emptyTitle}>This board is empty</div>
            <div className={styles.emptySub}>{board?.isInbox ? "Link your Discord server and files will appear here." : "Add notes, text, or drag files from your Inbox."}</div>
          </div>
        )}
      </div>

      <div className={styles.toolbar}>
        <button className={`${styles.tBtn} ${mode === "select" ? styles.tBtnActive : ""}`} onClick={() => setMode("select")} title="Select [V]"><i className="ti ti-pointer" /></button>
        <button className={styles.tBtn} onClick={addNote} title="Note [N]"><i className="ti ti-note" /></button>
        <button className={styles.tBtn} onClick={addText} title="Text [T]"><i className="ti ti-text-size" /></button>
        <button className={styles.tBtn} onClick={addPerson} title="Add person"><i className="ti ti-user-plus" /></button>
        <button className={styles.tBtn} onClick={addChannel} title="Add channel"><i className="ti ti-hash" /></button>
        <div className={styles.tDiv} />
        <button className={styles.tBtn} onClick={autoArrange} title="Auto-arrange by sender">
          <i className="ti ti-layout-grid" />
        </button>
        <div className={styles.tDiv} />
        <button className={`${styles.tBtn} ${mode === "connect" ? styles.tBtnActive : ""}`}
          onClick={() => { const next = mode === "connect" ? "select" : "connect"; setMode(next); setConnectFromId(null); if (next === "connect") showToast("Click two nodes to connect"); }}
          title="Connect [C]"><i className="ti ti-line" /></button>
      </div>

      <div className={styles.zoom}>
        <button className={styles.zBtn} onClick={() => setViewport(vp => ({ ...vp, scale: Math.min(2.5, vp.scale + 0.15) }))}><i className="ti ti-plus" /></button>
        <div className={styles.zLevel}>{Math.round(viewport.scale * 100)}%</div>
        <button className={styles.zBtn} onClick={() => setViewport(vp => ({ ...vp, scale: Math.max(0.25, vp.scale - 0.15) }))}><i className="ti ti-minus" /></button>
        <button className={styles.zBtn} onClick={() => setViewport({ x: 0, y: 0, scale: 1 })} title="Reset"><i className="ti ti-focus-centered" /></button>
      </div>

      <div className={styles.hint}>Drag empty space to pan · Scroll to zoom · <b>Double-click</b> sticky/text to edit · <b>Del</b> to remove</div>

      {selectedItem && (
       <DetailPanel
  item={selectedItem} items={items}
  editingConnId={editingConnId}
  setEditingConnId={setEditingConnId}
  onClose={() => { setSelectedId(null); setEditingConnId(null); }}
  onSelectItem={(id) => { setSelectedId(id); setEditingConnId(null); }}
  onDelete={() => deleteItem(selectedItem.id)}
  onRemoveConnection={(toId) => removeConnection(selectedItem.id, toId)}
  onColorChange={(rgb) => updateColor(selectedItem.id, selectedItem, rgb)}
  onConnectionColorChange={(toId, rgb) => setConnectionColor(selectedItem.id, toId, rgb)}
  onSizeChange={(scale) => updateSize(selectedItem.id, scale)}
/>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
      {showShare && board && <ShareModal board={board} onClose={() => setShowShare(false)} />}
    </div>
  ); 
}

// ───────────────────────────── Node ─────────────────────────────

function Node({ item, isVisible, isSelected, isConnectFrom, isEditing, onMouseDown, onStartEdit, onContentChange }) {
  const color = getColor(item);
  const cls = [
    styles.node,
    !isVisible && styles.nodeFaded,
    isSelected && styles.nodeSelected,
    isConnectFrom && styles.nodeConnectFrom,
  ].filter(Boolean).join(" ");
  const style = {
    left: item.x,
    top: item.y,
    transform: `scale(${item.scale || 1})`,
    transformOrigin: "0 0",
  };

  if (item.type === "person") {
    const initials = (item.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (
      <div className={cls} style={style} onMouseDown={onMouseDown}>
        <div className={styles.person} style={{ background: `rgba(${color},0.15)`, border: `1.5px solid rgba(${color},0.6)`, color: `rgb(${color})` }}>{initials}</div>
        <span className={styles.personLbl}>{item.name}</span>
      </div>
    );
  }

  if (item.type === "channel") {
    return (
      <div className={cls} style={style} onMouseDown={onMouseDown}>
        <div className={styles.channel} style={{ color: `rgba(${color},0.85)`, borderColor: `rgba(${color},0.3)` }}>
          <i className="ti ti-hash" /> {item.name}
        </div>
      </div>
    );
  }

  if (item.type === "sticky") {
    return (
      <div className={cls} style={style} onMouseDown={onMouseDown} onDoubleClick={onStartEdit}>
        <div
          className={styles.sticky}
          style={{ background: item.bg, color: item.fg, border: `0.5px solid ${item.bd}` }}
          contentEditable={isEditing}
          suppressContentEditableWarning
          ref={(el) => { if (isEditing && el && document.activeElement !== el) el.focus(); }}
          onBlur={(e) => onContentChange(e.target.textContent)}
        >{item.content}</div>
      </div>
    );
  }

  if (item.type === "text") {
    return (
      <div className={cls} style={style} onMouseDown={onMouseDown} onDoubleClick={onStartEdit}>
        <div
          className={styles.text}
          contentEditable={isEditing}
          suppressContentEditableWarning
          ref={(el) => { if (isEditing && el && document.activeElement !== el) el.focus(); }}
          onBlur={(e) => onContentChange(e.target.textContent)}
        >{item.content}</div>
      </div>
    );
  }

  return (
    <div className={cls} style={style} onMouseDown={onMouseDown}>
      <div className={styles.fileCard} style={{ background: `rgba(${color},0.06)`, borderColor: `rgba(${color},0.28)` }}>
        <div className={styles.fileIco} style={{ background: `rgba(${color},0.14)`, color: `rgb(${color})` }}>
          <i className={`ti ${TYPE_ICONS[item.type] || "ti-file"}`} />
        </div>
        <div className={styles.fileName}>{item.name}</div>
        <div className={styles.fileMeta}>{item.sender ? `${item.sender} · ` : ""}{timeAgo(item.timestamp)}</div>
        {item.size && (
          <div className={styles.fileTag} style={{ background: `rgba(${color},0.14)`, color: `rgb(${color})` }}>{item.size}</div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── Detail Panel ─────────────────────────────

function DetailPanel({ item, items, editingConnId, setEditingConnId, onClose, onSelectItem, onDelete, onRemoveConnection, onColorChange, onConnectionColorChange, onSizeChange }) {
  const color = getColor(item);
  const outgoing = (item.connectedTo || []).map(id => items.find(i => i.id === id)).filter(Boolean);
  const incoming = items.filter(i => (i.connectedTo || []).includes(item.id));
  const showColors = ["sticky", "person", "channel", "text"].includes(item.type);

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelBadge} style={{ background: `rgba(${color},0.15)`, color: `rgb(${color})` }}>{item.type}</span>
        <button className={styles.panelClose} onClick={onClose}><i className="ti ti-x" /></button>
      </div>

      <div className={styles.panelName}>{item.name || item.content || "Untitled"}</div>

      <div className={styles.panelMeta}>
        {item.sender && <div className={styles.metaRow}><span>Sender</span><span>{item.sender}</span></div>}
        {item.channel && <div className={styles.metaRow}><span>Channel</span><span>#{item.channel}</span></div>}
        {item.size && <div className={styles.metaRow}><span>Size</span><span>{item.size}</span></div>}
        {item.timestamp && <div className={styles.metaRow}><span>Added</span><span>{timeAgo(item.timestamp)}</span></div>}
      </div>

      {showColors && (
        <>
          <div className={styles.panelSection}>Node color</div>
          <div className={styles.colorGrid}>
            {COLOR_OPTIONS.map(c => (
              <button key={c.id} className={`${styles.colorSwatch} ${item.color === c.rgb ? styles.colorActive : ""}`}
                style={{ background: `rgba(${c.rgb},0.18)`, borderColor: `rgba(${c.rgb},0.6)` }}
                onClick={() => onColorChange(c.rgb)} title={c.name}>
                <span style={{ background: `rgb(${c.rgb})` }} />
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.panelSection}>Size</div>
      <div className={styles.sizeRow}>
        {[
          { value: 0.7, label: "S" },
          { value: 1, label: "M" },
          { value: 1.5, label: "L" },
          { value: 2.2, label: "XL" },
        ].map(s => (
          <button key={s.value}
            className={`${styles.sizeBtn} ${(item.scale || 1) === s.value ? styles.sizeBtnActive : ""}`}
            onClick={() => onSizeChange(s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      {(outgoing.length > 0 || incoming.length > 0) && (
        <>
          <div className={styles.panelSection}>Connections ({outgoing.length + incoming.length})</div>
          <div className={styles.panelConns}>
            {outgoing.map(c => {
              const connColor = (item.connectionStyles && item.connectionStyles[c.id]?.color) || getColor(item);
              const isEditing = editingConnId === c.id;
              return (
                <div key={`out-${c.id}`} className={styles.connWrapper}>
                  <div className={styles.panelConn}>
                    <div className={styles.connMain} onClick={() => onSelectItem(c.id)}>
                      <i className={`ti ${TYPE_ICONS[c.type] || "ti-link"}`} style={{ color: `rgb(${getColor(c)})` }} />
                      <span>{c.name || c.content || "Untitled"}</span>
                    </div>
                    <button className={`${styles.connColorBtn} ${isEditing ? styles.connColorBtnActive : ""}`}
                      style={{ background: `rgb(${connColor})` }}
                      onClick={(e) => { e.stopPropagation(); setEditingConnId(isEditing ? null : c.id); }}
                      title="Change color" />
                    <button className={styles.connRemove} onClick={(e) => { e.stopPropagation(); onRemoveConnection(c.id); }}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                  {isEditing && (
                    <div className={styles.miniColorGrid}>
                      {COLOR_OPTIONS.map(co => (
                        <button key={co.id}
                          className={`${styles.miniSwatch} ${connColor === co.rgb ? styles.miniSwatchActive : ""}`}
                          style={{ background: `rgb(${co.rgb})` }}
                          onClick={() => { onConnectionColorChange(c.id, co.rgb); setEditingConnId(null); }}
                          title={co.name}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {incoming.map(c => (
              <div key={`in-${c.id}`} className={styles.panelConn} onClick={() => onSelectItem(c.id)}>
                <div className={styles.connMain}>
                  <i className={`ti ${TYPE_ICONS[c.type] || "ti-link"}`} style={{ color: `rgb(${getColor(c)})` }} />
                  <span>{c.name || c.content || "Untitled"}</span>
                </div>
                <span className={styles.connDir}>← in</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.panelActions}>
        {item.attachmentUrl && (
          <a href={item.attachmentUrl} target="_blank" rel="noreferrer" className={styles.panelBtn}>
            <i className="ti ti-external-link" /> Open original
          </a>
        )}
        <button className={`${styles.panelBtn} ${styles.panelBtnDanger}`} onClick={onDelete}>
          <i className="ti ti-trash" /> Delete
        </button>
      </div>
    </aside>
  );
}