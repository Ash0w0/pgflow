import { Caveat, Instrument_Serif } from "next/font/google";

/** Editorial accent for a few words per headline on the public homepage. */
export const editorialSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--ph-serif",
  display: "swap",
});

/** Handwriting, used only for the paper register and the founder's signature. */
export const handwriting = Caveat({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--ph-hand",
  display: "swap",
});
