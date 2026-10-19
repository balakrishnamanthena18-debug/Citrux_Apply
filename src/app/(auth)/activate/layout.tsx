import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Career Button Client Portal | Account Activation",
  description: "Activate your Career Button candidate account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ActivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
