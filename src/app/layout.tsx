import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RHYTHM::OS",
  description: "A rhythm game with Zenless Zone Zero aesthetic",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, overflow: 'hidden', background: '#0D1117' }}>
        {children}
      </body>
    </html>
  );
}
