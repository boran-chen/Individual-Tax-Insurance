import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3l7 3v5c0 4.4-2.9 8.3-7 10-4.1-1.7-7-5.6-7-10V6l7-3z" />
      <path d="M9.5 12l1.8 1.8 3.4-3.6" />
    </Base>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Base>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </Base>
  );
}

export function IconReturns(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h11a4 4 0 010 8H8" />
      <path d="M8 12l-4 3 4 3" />
      <path d="M20 17H9" />
      <path d="M16 14l4 3-4 3" />
    </Base>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0111 0" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14.5a4.5 4.5 0 015 4.4" />
    </Base>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21s7-5.2 7-11a7 7 0 10-14 0c0 5.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Base>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21h-4v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3v-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 001.9.3 1.7 1.7 0 001-1.6V3h4v.1a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.6 1h.1v4H21a1.7 1.7 0 00-1.6 1z" />
    </Base>
  );
}

export function IconAudit(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 12h7M9 16h5" />
    </Base>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </Base>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </Base>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </Base>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.5" r=".6" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r=".6" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconFile(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </Base>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4" />
      <path d="M10 12H3" />
      <path d="M6 9l-3 3 3 3" />
    </Base>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 12h16" />
      <path d="M15 7l5 5-5 5" />
    </Base>
  );
}

export function IconX(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Base>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 11a8 8 0 10-2.3 6" />
      <path d="M20 5v6h-6" />
    </Base>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 6l-6 6 6 6" />
    </Base>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 6l6 6-6 6" />
    </Base>
  );
}

export function IconDatabase(props: IconProps) {
  return (
    <Base {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </Base>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </Base>
  );
}
