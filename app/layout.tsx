import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LAZU", template: "%s · LAZU" },
  description: "Estadísticas y administración de perfiles digitales LAZU.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
