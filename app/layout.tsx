import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./visual-system.css";
import "./hex-discovered-points.css";
import "./hex-sector-layout.css";
import "./chat.css";
import "./scene-board.css";
import "./conflict-workflow.css";
import "./community-scene-workflow.css";
import "./player-actions.css";
import "./search-session.css";
import "./activity-timeline.css";
import "./event-guides.css";
import "./campaign-usability.css";
import "./mobile-navigation.css";
import "./mobile-experience.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Zona Morta | Aplicativo de campanha",
  description: "Mapa de exploração, sobreviventes e regras de Daggerheart: Zona Morta.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try { const theme = localStorage.getItem('zona-morta-theme'); if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme; } catch {}" }} /></head>
      <body className="antialiased"><ThemeToggle />{children}<Toaster position="bottom-right" richColors closeButton /></body>
    </html>
  );
}
