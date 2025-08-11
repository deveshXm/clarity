"use client";

import { Button } from "@/components/ui";

type CTAButtonProps = {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
  loading?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
};

export default function CTAButton({ children, onClick, loading, size = "lg", className }: CTAButtonProps) {
  return (
    <Button
      size={size}
      onClick={onClick}
      loading={loading}
      styles={{
        root: {
          background: "linear-gradient(92deg, #38BDF8 0%, #60A5FA 50%, #22D3EE 100%)",
          color: "white",
          fontWeight: 800,
          letterSpacing: 0.2,
          height: 56,
          boxShadow: "0 10px 30px rgba(96,165,250,0.30)",
          borderRadius: 14,
        },
      }}
      className={`transition-transform hover:-translate-y-0.5 active:translate-y-0 ${className ?? ""}`}
    >
      {children}
    </Button>
  );
}


