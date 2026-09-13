import { ImageResponse } from "next/og";
import BrandMark from "@/components/BrandMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Square corners: iOS applies its own rounded mask to home-screen icons, and a
// pre-rounded image ends up with a dark ring inside the system's corners.
export default function AppleIcon() {
  return new ImageResponse(<BrandMark size={180} rounded={false} />, size);
}
