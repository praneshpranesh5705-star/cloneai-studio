import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CloneAI Studio — Build your own AI universe",
  description: "Create AI agents, voice experiences, avatars and websites in one workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}