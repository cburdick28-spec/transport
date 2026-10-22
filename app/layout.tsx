import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Madrid Transit Manager",
  description: "Build bus lines across Madrid and survive derbies, protests and World Cup crowds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
