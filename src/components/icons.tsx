import type { SVGProps } from "react";

/**
 * Hand-rolled icon set.
 *
 * These were `lucide-react` imports. Lucide tree-shakes, but every icon still
 * drags in the `createLucideIcon` factory plus `forwardRef` wrappers — for the
 * handful of glyphs this app uses, inlining the paths is several kB gzip cheaper and
 * removes a dependency from a security-sensitive build.
 *
 * All of them share lucide's 24×24 grid and 2px stroke geometry, so the visual
 * result is unchanged.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ScanLineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

export function CameraOffIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <path d="m2 2 20 20" />
      <path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h13" />
      <path d="M9.5 4h5l1.5 3h3a2 2 0 0 1 2 2v7.5" />
      <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
    </Icon>
  );
}

export function ImageUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
      <path d="m3 17 5-5c.9-.9 2.1-.9 3 0l4 4" />
      <circle cx="9" cy="8.5" r="1.4" />
      <path d="M18 9V2" />
      <path d="m15 5 3-3 3 3" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </Icon>
  );
}

export function CloudIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 10.4 3.8 3.8 0 0 0 6.5 19h11Z" />
    </Icon>
  );
}

export function CloudLockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 15.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 5.9 8.4 3.6 3.6 0 0 0 6.2 15.5" />
      <rect x="9" y="14" width="6" height="6" rx="1" />
      <path d="M10.8 14v-1.2a1.2 1.2 0 0 1 2.4 0V14" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 1.8 20a1 1 0 0 0 .9 1.5h18.6a1 1 0 0 0 .9-1.5L12 3.5Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17.4" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/**
 * Brand mark for the header. The original page ships no logo or favicon at all,
 * so this is a neutral shield-with-key mark drawn in Google blue — deliberately
 * not the Google or Google Authenticator trademark.
 */
export function BrandMark({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path
        d="M14 2.5 4.75 6.2v7.05c0 5.72 3.86 11.05 9.25 12.35 5.39-1.3 9.25-6.63 9.25-12.35V6.2L14 2.5Z"
        fill="var(--g-blue)"
      />
      <path
        d="M14 9.4a2.9 2.9 0 0 0-1.1 5.59v3.6l1.1 1.1 1.55-1.55-1.05-1.05 1.05-1.05-1.05-1.05v.01a2.9 2.9 0 0 0-.5-5.6Z"
        fill="#fff"
      />
      <circle cx="12.75" cy="11.85" r="0.95" fill="var(--g-blue)" />
    </svg>
  );
}

/** Four corner brackets for the scanner viewfinder. */
export function ScanFrame({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <g stroke="#fff" strokeWidth="3" strokeLinecap="round">
        <path d="M6 24V10a4 4 0 0 1 4-4h14" />
        <path d="M76 6h14a4 4 0 0 1 4 4v14" />
        <path d="M94 76v14a4 4 0 0 1-4 4H76" />
        <path d="M24 94H10a4 4 0 0 1-4-4V76" />
      </g>
    </svg>
  );
}
