import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "買い物リスト",
  description: "声とSiriで追加できる、家族の買い物リスト",
  applicationName: "買い物リスト",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "買い物リスト" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#2f7d4a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
