import type { Metadata, Viewport } from "next";
import { Jost } from "next/font/google";
import "./globals.css";

const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" });

export const metadata: Metadata = {
  title: { default: "RIRO · Financeiro", template: "%s · RIRO" },
  description: "Sistema de gestão financeira do RIRO Salon",
  icons: { icon: "/icone.png" },
};

export const viewport: Viewport = {
  themeColor: "#b97953",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={jost.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
