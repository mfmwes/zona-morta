import type { Metadata } from "next";
import "./globals.css";
import "./visual-system.css";
import "./chat.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Zona Morta | Aplicativo de campanha",
  description: "Mapa de exploração, sobreviventes e regras de Daggerheart: Zona Morta.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}<Toaster position="bottom-right" richColors closeButton /></body>
    </html>
  );
}
