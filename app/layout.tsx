import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Website Rescue", description: "Private lead CRM for website redesign outreach" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
