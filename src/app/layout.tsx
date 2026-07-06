import type { Metadata } from "next";
import {
  IBM_Plex_Sans,
  Inter,
  Manrope,
  Noto_Sans,
  PT_Sans,
  Source_Sans_3
} from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

const inter = Inter({
  display: "swap",
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"]
});

const manrope = Manrope({
  display: "swap",
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700"]
});

const ibmPlexSans = IBM_Plex_Sans({
  display: "swap",
  subsets: ["latin", "cyrillic"],
  variable: "--font-ibm-plex-sans",
  weight: ["400", "500", "600", "700"]
});

const notoSans = Noto_Sans({
  display: "swap",
  subsets: ["latin", "cyrillic"],
  variable: "--font-noto-sans",
  weight: ["400", "500", "600", "700"]
});

const sourceSans3 = Source_Sans_3({
  display: "swap",
  subsets: ["latin", "cyrillic"],
  variable: "--font-source-sans-3",
  weight: ["400", "500", "600", "700"]
});

const ptSans = PT_Sans({
  display: "swap",
  subsets: ["latin", "cyrillic"],
  variable: "--font-pt-sans",
  weight: ["400", "700"]
});

const fontClasses = [
  inter.variable,
  manrope.variable,
  ibmPlexSans.variable,
  notoSans.variable,
  sourceSans3.variable,
  ptSans.variable
].join(" ");

export const metadata: Metadata = {
  title: "Task Tracker",
  description: "Personal daily task and calendar tracker"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html className={fontClasses} lang="ru" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeScript />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
