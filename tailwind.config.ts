import type { Config } from "tailwindcss";

// =========================================================================
// Tailwind config — Friendly Business OS design tokens (Phase 2A).
//
// Tokens are defined as CSS variables in src/app/globals.css. This file
// surfaces them as semantic Tailwind utility classes:
//
//   bg-app                         — page background
//   bg-surface / bg-surface-muted  — cards / hover / soft fill
//   text-ink                       — primary body text
//   text-ink-muted                 — labels, supporting copy
//   text-ink-faint                 — small metadata
//   border-line / border-line-strong
//   bg-brand / text-brand / bg-brand-strong
//   bg-{state} / text-{state} / bg-{state}-soft / text-{state}-strong
//
// {state} ∈ success | warning | danger | info | neutral.
//
// Distinct top-level keys (`ink`, `line`, `surface`) keep each utility
// prefix unambiguous — `bg-ink` is dark; `text-ink` is dark text. We
// don't reuse the same key across text and border because they hold
// genuinely different colors.
// =========================================================================

function token(name: string): string {
  return `rgb(var(--color-${name}) / <alpha-value>)`;
}

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/plugins/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // surfaces
        app: token("app"),
        surface: {
          DEFAULT: token("surface"),
          muted: token("surface-muted"),
        },
        // text — used via `text-ink`, `text-ink-muted`, `text-ink-faint`
        ink: {
          DEFAULT: token("text"),
          muted: token("text-muted"),
          faint: token("text-faint"),
        },
        // borders — used via `border-line`, `border-line-strong`
        line: {
          DEFAULT: token("border"),
          strong: token("border-strong"),
        },
        // brand
        brand: {
          DEFAULT: token("brand"),
          strong: token("brand-strong"),
        },
        // state tones — each has a solid, soft (background), and strong (emphasized text)
        success: {
          DEFAULT: token("success"),
          soft: token("success-soft"),
          strong: token("success-strong"),
        },
        warning: {
          DEFAULT: token("warning"),
          soft: token("warning-soft"),
          strong: token("warning-strong"),
        },
        danger: {
          DEFAULT: token("danger"),
          soft: token("danger-soft"),
          strong: token("danger-strong"),
        },
        info: {
          DEFAULT: token("info"),
          soft: token("info-soft"),
          strong: token("info-strong"),
        },
        neutral: {
          DEFAULT: token("muted"),
          soft: token("muted-soft"),
          strong: token("muted-strong"),
        },
      },
      borderRadius: {
        control: "var(--radius-control)",
        card: "var(--radius-card)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        floating: "var(--shadow-floating)",
      },
    },
  },
  plugins: [],
};

export default config;
