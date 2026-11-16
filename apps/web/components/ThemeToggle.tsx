"use client";

// Theme toggle: the static site's behaviour — flips data-theme on
// <html>, persisted in localStorage under "ts-theme" (the layout
// applies the stored value before first paint).
export function ThemeToggle({ title }: { title: string }) {
  return (
    <button
      className="theme-btn"
      type="button"
      title={title}
      onClick={() => {
        const h = document.documentElement;
        const next = h.getAttribute("data-theme") === "light" ? "" : "light";
        if (next) h.setAttribute("data-theme", next);
        else h.removeAttribute("data-theme");
        try {
          localStorage.setItem("ts-theme", next);
        } catch {
          /* private mode: theme just won't persist */
        }
      }}
    >
      ◐
    </button>
  );
}
