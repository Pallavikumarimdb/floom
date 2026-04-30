import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Floom — Function UI in 60 seconds",
  description: "Generate a UI for Python function apps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}
