import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CloneAI Studio — Build your own AI universe",
  description: "Create AI agents with your own knowledge, and chat with them in one workspace.",
  metadataBase: new URL("https://cloneai-studio.vercel.app"),
  openGraph: {
    title: "CloneAI Studio",
    description: "Create AI agents with your own knowledge, and chat with them in one workspace.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
