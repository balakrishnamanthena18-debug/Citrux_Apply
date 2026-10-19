import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Career Button Client Portal | Candidate Login",
  description: "Sign in to access your Career Button candidate portal and managed career search services.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
