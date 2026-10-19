import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Career Button Client Portal | Staff Account Activation",
  description: "Activate your Career Button staff account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthActivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
