import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veashi - Cross-Chain Message Explorer",
  description: "Explore cross-chain messages sent using Hashi protocol with multiple bridge providers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <div className="gradient-mesh" />
        {children}
      </body>
    </html>
  );
}
