// Simplified platform marks for share tabs and buttons (inline, no network, currentColor or brand fill).
import type { SVGProps } from "react";

export type Platform = "linkedin" | "x" | "instagram";

export function PlatformIcon({ platform, brand = false, ...props }: { platform: Platform; brand?: boolean } & SVGProps<SVGSVGElement>) {
  if (platform === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...props}>
        <rect width="24" height="24" rx="4" fill={brand ? "#0A66C2" : "currentColor"} />
        <path fill="#fff" d="M6.94 8.5H4.3V19h2.64V8.5ZM5.62 4.5a1.53 1.53 0 1 0 0 3.06 1.53 1.53 0 0 0 0-3.06ZM19.7 13.06c0-2.82-1.5-4.75-4.12-4.75-1.26 0-2.1.69-2.45 1.34h-.04V8.5H10.6V19h2.64v-5.2c0-1.37.26-2.7 1.96-2.7 1.67 0 1.7 1.57 1.7 2.79V19h2.64v-5.94Z" />
      </svg>
    );
  }
  if (platform === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...props}>
        <rect width="24" height="24" rx="4" fill={brand ? "#000" : "currentColor"} />
        <path fill="#fff" d="M16.2 5.5h2.2l-4.8 5.5 5.65 7.5h-4.42l-3.47-4.53-3.96 4.53H5.2l5.14-5.88L4.92 5.5h4.53l3.13 4.14L16.2 5.5Zm-.77 11.68h1.22L8.75 6.75H7.44l7.99 10.43Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <defs>
        <linearGradient id="ig-grad" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset=".35" stopColor="#FA7E1E" />
          <stop offset=".65" stopColor="#D62976" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={brand ? "url(#ig-grad)" : "currentColor"} />
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="16.1" cy="7.9" r="1" fill="#fff" />
    </svg>
  );
}
