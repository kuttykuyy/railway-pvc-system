import { Metadata } from "next";

export const metadata: Metadata = {
  title: "PPAC Fuel Prices",
  description: "Import and manage daily petrol prices from PPAC for Delhi, Mumbai, Chennai, and Kolkata",
};

export default function FuelPricesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
