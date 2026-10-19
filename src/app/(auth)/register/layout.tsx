import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Career Button Client Portal | Candidate Registration",
  description: "Create your Career Button candidate account to access managed job search and career intelligence.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
