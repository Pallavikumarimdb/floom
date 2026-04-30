import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Floom 60-second",
  description: "Minimal generated app runner"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
