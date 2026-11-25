import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { site } from "@/lib/copy";
import { themeScript } from "@/components/layout/ThemeToggle";
import { cinzel, jakarta } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // Production always uses the live domain, so a stray localhost NEXT_PUBLIC_APP_URL can never break link previews.
  metadataBase: new URL(process.env.VERCEL_ENV === "production" ? site.url : (process.env.NEXT_PUBLIC_APP_URL ?? site.url)),
  title: { default: `${site.name}: ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  manifest: "/site.webmanifest",
  openGraph: { title: site.name, description: site.tagline, type: "website" },
  twitter: { card: "summary_large_image", title: site.name, description: site.tagline },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cinzel.variable} ${jakarta.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Fixed string, no user input: applies the saved theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ClerkProvider appearance={clerkAppearance}>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
