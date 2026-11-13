import { Caveat } from "next/font/google";

/** Handwriting, used only for the paper register and the founder's signature. */
export const handwriting = Caveat({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--ph-hand",
  display: "swap",
});
