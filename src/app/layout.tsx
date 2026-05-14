import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Sunan Motor",
    template: "%s | Sunan Motor",
  },
  description: "Aplikasi pencatatan jual beli motor Sunan Motor — catat, pantau, dan kelola bisnis motor Anda.",
  manifest: "/manifest.json",
  keywords: ["motor", "penjualan", "pembelian", "catat", "usaha", "sunan motor"],
  authors: [{ name: "Sunan Motor" }],
  creator: "Sunan Motor",
  publisher: "Sunan Motor",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sunan Motor",
    startupImage: [
      // iPhone 16 Pro Max (430 × 932 @3x)
      {
        url: "/icons/apple-touch-icon.png",
        media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 16 Pro / 15 Pro (393 × 852 @3x)
      {
        url: "/icons/apple-touch-icon.png",
        media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 14 Pro Max (430 × 932 @3x) / 15 Plus
      {
        url: "/icons/apple-touch-icon.png",
        media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 14 / 13 / 12 (390 × 844 @3x)
      {
        url: "/icons/apple-touch-icon.png",
        media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 13 mini / 12 mini (375 × 812 @3x)
      {
        url: "/icons/apple-touch-icon.png",
        media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 11 Pro Max / XS Max (414 × 896 @3x)
      {
        url: "/icons/apple-touch-icon.png",
        media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 11 / XR (414 × 896 @2x)
      {
        url: "/icons/apple-touch-icon.png",
        media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)",
      },
      // iPhone X / XS (375 × 812 @3x)
      {
        url: "/icons/apple-touch-icon.png",
        media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 8 Plus / 7 Plus (414 × 736 @3x)
      {
        url: "/icons/apple-touch-icon-167.png",
        media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)",
      },
      // iPhone 8 / 7 / SE 2 (375 × 667 @2x)
      {
        url: "/icons/apple-touch-icon-152.png",
        media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
      },
      // iPhone SE 1st gen (320 × 568 @2x)
      {
        url: "/icons/apple-touch-icon-120.png",
        media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)",
      },
      // iPad Pro 12.9" (1024 × 1366)
      {
        url: "/icons/sunan-512.png",
        media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)",
      },
      // iPad Pro 11" (834 × 1194)
      {
        url: "/icons/sunan-512.png",
        media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)",
      },
    ],
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/sunan-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/sunan-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-120.png", sizes: "120x120", type: "image/png" },
      { url: "/icons/apple-touch-icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/apple-touch-icon-167.png", sizes: "167x167", type: "image/png" },
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: [
      { url: "/icons/favicon-32x32.png", type: "image/png" },
    ],
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    title: "Sunan Motor",
    description: "Aplikasi pencatatan jual beli motor Sunan Motor",
    siteName: "Sunan Motor",
    images: [
      {
        url: "/icons/sunan-512.png",
        width: 512,
        height: 512,
        alt: "Sunan MotoTrack",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4338ca" },
    { media: "(prefers-color-scheme: dark)", color: "#1f2937" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* iOS PWA Full Screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Sunan Motor" />

        {/* Android PWA */}
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Microsoft Tile */}
        <meta name="msapplication-TileColor" content="#4338ca" />
        <meta name="msapplication-TileImage" content="/icons/sunan-192.png" />

        {/* Preconnect untuk performa */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Explicit icon links for broader compatibility */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/icons/apple-touch-icon-120.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />

        {/* Safari pinned tab */}
        <link rel="mask-icon" href="/icons/sunan-192.png" color="#4338ca" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
