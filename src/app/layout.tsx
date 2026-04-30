import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Floom — Deploy functions in 60 seconds",
  description: "From localhost to live and secure. Deploy Python and TypeScript functions with one command.",
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
