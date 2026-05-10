import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blog WebP Optimizer",
  description: "Local WebP conversion for blog images"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
