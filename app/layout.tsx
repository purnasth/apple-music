import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "Music by Purna";
const DESCRIPTION =
  "Search, preview and play your music library — no account, no server.";

export const metadata: Metadata = {
  // metadataBase resolves the relative image below to an absolute URL, which is
  // the only kind a scraper can fetch. A static export has no request to infer
  // the origin from, so it has to be written down.
  metadataBase: new URL("https://music.purnashrestha.com.np"),
  // The mark still just says "Music"; the page is the one that carries the name.
  title: { default: TITLE, template: `%s — ${TITLE}` },
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  // The app hands out links now — playlists, and filtered library views — so
  // what those links unfurl into in a chat is part of the feature.
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: TITLE }],
  },
  // "summary", not "summary_large_image": the only artwork here is the square
  // mark, and a square stretched into a 2:1 frame looks like a mistake.
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export const viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
