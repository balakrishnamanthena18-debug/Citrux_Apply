import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Operations Operating System (OOS)",
  description: "Operations Operating System platform baseline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-surface text-text-primary antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
