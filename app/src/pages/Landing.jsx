import { Link } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import styles from "./Landing.module.css";

const PREVIEW_FILES = [
  { name: "project_brief.pdf", icon: "ti-file-type-pdf", color: "232,89,60", x: 8, y: 18 },
  { name: "hero_banner.png", icon: "ti-photo", color: "78,205,196", x: 32, y: 52 },
  { name: "auth_flow.py", icon: "ti-code", color: "108,99,255", x: 56, y: 22 },
  { name: "demo_video.mp4", icon: "ti-video", color: "239,159,39", x: 70, y: 60 },
];

export default function Landing() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <div className={styles.logoIcon} />
          <span>FileWeb</span>
        </div>
        <div className={styles.navRight}>
          <button className={styles.iconBtn} onClick={toggleTheme} aria-label="Toggle theme">
            <i className={`ti ti-${theme === "dark" ? "sun" : "moon"}`} />
          </button>
          <Link to="/login" className={styles.linkBtn}>Sign in</Link>
          <Link to="/signup" className={styles.primaryBtn}>Get started</Link>
        </div>
      </nav>

      <main className={styles.hero}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          Now in beta
        </div>

        <h1 className={styles.headline}>
          Your Discord files,<br />
          <span className={styles.accent}>visually organized</span>
        </h1>

        <p className={styles.sub}>
          FileWeb indexes every file your team has shared on Discord and lays them out
          on a beautiful, collaborative canvas. Search, connect, and annotate — all in one place.
        </p>

        <div className={styles.ctas}>
          <Link to="/signup" className={styles.ctaPrimary}>
            Get started free
            <i className="ti ti-arrow-right" />
          </Link>
          <Link to="/login" className={styles.ctaSecondary}>Sign in</Link>
        </div>

        <div className={styles.previewWrap}>
          <div className={styles.preview}>
            <div className={styles.previewBar}>
              <div className={styles.previewControls}>
                <span style={{ background: "#FF5F57" }} />
                <span style={{ background: "#FFBD2E" }} />
                <span style={{ background: "#28C840" }} />
              </div>
              <span className={styles.previewUrl}>fileweb.app/board/inbox</span>
            </div>
            <div className={styles.previewCanvas}>
              {PREVIEW_FILES.map((f, i) => (
                <div key={i} className={styles.previewCard} style={{
                  left: `${f.x}%`, top: `${f.y}%`,
                  borderColor: `rgba(${f.color}, 0.3)`,
                  background: `rgba(${f.color}, 0.06)`,
                  animationDelay: `${i * 0.1}s`,
                }}>
                  <i className={`ti ${f.icon}`} style={{ color: `rgb(${f.color})` }} />
                  <span>{f.name}</span>
                </div>
              ))}
              <svg className={styles.previewLines}>
                <path d="M 80 60 Q 200 80, 280 140" stroke="var(--bd-s)" strokeWidth="1" fill="none" strokeDasharray="4 4" />
                <path d="M 320 80 Q 420 100, 480 160" stroke="var(--bd-s)" strokeWidth="1" fill="none" strokeDasharray="4 4" />
              </svg>
            </div>
          </div>
        </div>

        <div className={styles.features}>
          {[
            { icon: "ti-bolt", title: "Instant indexing", desc: "Files appear the moment they're shared." },
            { icon: "ti-share", title: "Collaborative boards", desc: "Invite teammates to annotate together." },
            { icon: "ti-search", title: "Powerful search", desc: "Find any file by name, sender, or channel." },
          ].map((f, i) => (
            <div key={i} className={styles.feature}>
              <div className={styles.featureIcon}><i className={`ti ${f.icon}`} /></div>
              <div className={styles.featureTitle}>{f.title}</div>
              <div className={styles.featureDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </main>

      <footer className={styles.footer}>
        <span>© 2025 FileWeb</span>
        <span>Built with care</span>
      </footer>
    </div>
  );
}