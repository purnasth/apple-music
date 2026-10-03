import type { Metadata } from "next";
import YouTube from "@/components/YouTube";

export const metadata: Metadata = {
  title: "YouTube",
  description: "Search YouTube and play full songs, signed in or as a guest.",
  alternates: { canonical: "/youtube" },
};

export default function Page() {
  return <YouTube />;
}
