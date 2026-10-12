import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeScript } from "@/components/layout/theme-script";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME, APP_TAGLINE, COMPANY_NAME } from "@/lib/constants";
import "./globals.css";

/* Inter (variable, with the optical-size axis) is the UI face; Geist Mono sets task keys, kbd hints and figures. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: `%s · ${APP_NAME}`,
    default: APP_NAME,
  },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  authors: [{ name: COMPANY_NAME }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under notches / the home indicator; fixed chrome pads itself with env(safe-area-inset-*).
  viewportFit: "cover",
  // Android Chrome: shrink the layout viewport when the on-screen keyboard opens, so bottom
  // sheets and their sticky footers stay above the keyboard (ignored elsewhere).
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the theme script sets `.dark`, data-motion and
    // data-transparency on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh font-sans">
        <MotionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
