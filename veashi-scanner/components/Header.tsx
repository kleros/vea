import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

export default function Header() {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const setHeight = () => {
      document.documentElement.style.setProperty("--header-height", `${el.offsetHeight}px`);
    };

    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={headerRef} className="sticky top-0 z-50 glass border-b border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center relative overflow-hidden">
              {/* <div className="absolute inset-0 bg-gradient-to-br from-[var(--purple-700)] to-[var(--pink-600)]" /> */}

              <img src="/logo.png" alt="Veashi Logo" width={40} height={40} className="relative z-10 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-[var(--purple-500)] to-[var(--pink-500)] bg-clip-text text-transparent group-hover:from-[var(--purple-400)] group-hover:to-[var(--pink-400)] transition-all">
                Veashi
              </h1>
              <p className="text-xs text-[var(--text-muted)]">Cross-Chain Explorer</p>
            </div>
          </Link>

          <nav className="flex items-center gap-6">
            <Link
              to="/"
              className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Messages
            </Link>
            <Link
              to="/routes"
              className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Routes
            </Link>
            <a
              href="https://github.com/kleros/vea"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
