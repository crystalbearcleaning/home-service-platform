import type { SVGProps } from "react";

// =========================================================================
// Minimal inline icon set for the admin shell. Outline-style, 1.5px
// stroke, 24×24 viewbox. Kept inline (no icon dependency) so the design
// tokens stay self-contained. Add more icons here when Step 2B needs them.
// =========================================================================

export type AdminIconKey =
  | "home"
  | "puzzle"
  | "inbox"
  | "users"
  | "document"
  | "tasks"
  | "activity"
  | "pulse"
  | "wrench"
  | "shield"
  | "menu"
  | "close"
  | "broadcast"
  | "megaphone"
  | "flask";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

const ICONS: Record<AdminIconKey, (props: IconProps) => React.ReactElement> = {
  home: (p) => (
    <Base {...p}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </Base>
  ),
  puzzle: (p) => (
    <Base {...p}>
      <path d="M9 4a2 2 0 1 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 1 1 0 4h-1v3a1 1 0 0 1-1 1h-3v1a2 2 0 1 1-4 0v-1H6a1 1 0 0 1-1-1v-4H4a2 2 0 1 1 0-4h1V6a1 1 0 0 1 1-1h3V4Z" />
    </Base>
  ),
  inbox: (p) => (
    <Base {...p}>
      <path d="M4 13h4l1.5 2h5L16 13h4" />
      <path d="M5 5h14l1 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5l1-8Z" />
    </Base>
  ),
  users: (p) => (
    <Base {...p}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M14 14.2c2.5-.6 5.4.6 6.5 4.3" />
    </Base>
  ),
  document: (p) => (
    <Base {...p}>
      <path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M15 3v4h4" />
      <path d="M9 12h6M9 16h6M9 8h3" />
    </Base>
  ),
  tasks: (p) => (
    <Base {...p}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m8 12 2.5 2.5L16 9" />
    </Base>
  ),
  activity: (p) => (
    <Base {...p}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </Base>
  ),
  pulse: (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h2l2-4 2 8 2-4h2" />
    </Base>
  ),
  wrench: (p) => (
    <Base {...p}>
      <path d="M14.5 3.5a5 5 0 0 1 5 6.5L21 11l-1 1-3.5-3.5L17.5 7 16 5.5 14.5 7l-1.5-1.5a5 5 0 0 1 1.5-2Z" />
      <path d="m13 8 8 8a2 2 0 0 1-3 3L10 11a4 4 0 1 1 3-3Z" />
    </Base>
  ),
  shield: (p) => (
    <Base {...p}>
      <path d="M12 3 4.5 6v6c0 4.4 3 7.8 7.5 9 4.5-1.2 7.5-4.6 7.5-9V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </Base>
  ),
  menu: (p) => (
    <Base {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  ),
  close: (p) => (
    <Base {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  ),
  broadcast: (p) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M6 6a8.5 8.5 0 0 0 0 12" />
      <path d="M18 6a8.5 8.5 0 0 1 0 12" />
    </Base>
  ),
  megaphone: (p) => (
    <Base {...p}>
      <path d="M4 10v4a1 1 0 0 0 1 1h3l8 4V5L8 9H5a1 1 0 0 0-1 1Z" />
      <path d="M18 9a3 3 0 0 1 0 6" />
    </Base>
  ),
  flask: (p) => (
    <Base {...p}>
      <path d="M9 3h6" />
      <path d="M10 3v6L5 19a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 19l-5-10V3" />
      <path d="M7.5 14h9" />
    </Base>
  ),
};

export function AdminIcon({
  name,
  ...rest
}: IconProps & { name: AdminIconKey }) {
  const Render = ICONS[name];
  return <Render {...rest} />;
}
