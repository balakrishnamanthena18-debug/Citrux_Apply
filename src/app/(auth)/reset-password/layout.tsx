import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Career Button Client Portal | Set New Password",
  description: "Set a new secure password for your Career Button candidate account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
