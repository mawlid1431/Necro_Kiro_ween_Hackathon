import localFont from "next/font/local";

// Self-hosted from docs/Necro_Brand_Assets/08_Fonts (OFL). Cinzel is display-only.
export const cinzel = localFont({
  src: [{ path: "./fonts/cinzel-latin-700-normal.woff2", weight: "700" }],
  variable: "--font-cinzel",
  display: "swap",
});

export const jakarta = localFont({
  src: [
    { path: "./fonts/plus-jakarta-sans-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/plus-jakarta-sans-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/plus-jakarta-sans-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/plus-jakarta-sans-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-jakarta",
  display: "swap",
});
