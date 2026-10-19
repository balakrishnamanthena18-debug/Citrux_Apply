import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Career Button Client Portal | Reset Password",
  description: "Request a password reset code for your Career Button candidate account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
