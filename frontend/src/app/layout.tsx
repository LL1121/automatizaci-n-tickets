import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Gestión de combustible · Irrigación Malargüe",
  description: "Captura y sincronización de tickets de combustible",
  icons: {
    icon: [
      { url: "/icon-irrigacion.png", type: "image/png" },
    ],
    shortcut: "/icon-irrigacion.png",
    apple: "/icon-irrigacion.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Combustible",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0066CC",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="safe-pt safe-pb">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
