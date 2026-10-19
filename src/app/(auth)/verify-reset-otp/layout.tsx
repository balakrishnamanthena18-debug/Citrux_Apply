import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Career Button Client Portal | Verify Code",
  description: "Verify your password recovery code for your Career Button account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function VerifyResetOtpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
