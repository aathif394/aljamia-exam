export const SECTION_PALETTES = [
  {
    bg: "bg-brand-900",
    light: "bg-brand-50",
    border: "border-brand-200",
    text: "text-brand-900",
    progressBar: "bg-brand-700",
    navAnswered: "bg-brand-900 border-brand-950 text-white",
    ring: "ring-brand-500",
  },
  {
    bg: "bg-stone-900",
    light: "bg-stone-50",
    border: "border-stone-200",
    text: "text-stone-900",
    progressBar: "bg-stone-700",
    navAnswered: "bg-stone-900 border-stone-950 text-white",
    ring: "ring-stone-500",
  },
  {
    bg: "bg-gold-700",
    light: "bg-gold-50",
    border: "border-gold-200",
    text: "text-gold-900",
    progressBar: "bg-gold-600",
    navAnswered: "bg-gold-700 border-gold-800 text-white",
    ring: "ring-gold-500",
  },
  {
    bg: "bg-brand-700",
    light: "bg-brand-50/50",
    border: "border-brand-100",
    text: "text-brand-800",
    progressBar: "bg-brand-600",
    navAnswered: "bg-brand-700 border-brand-800 text-white",
    ring: "ring-brand-400",
  },
  {
    bg: "bg-stone-800",
    light: "bg-stone-100",
    border: "border-stone-300",
    text: "text-stone-800",
    progressBar: "bg-stone-600",
    navAnswered: "bg-stone-800 border-stone-900 text-white",
    ring: "ring-stone-400",
  },
] as const;

export type SectionPalette = (typeof SECTION_PALETTES)[number];

export function getSectionPalette(section: number): SectionPalette {
  return SECTION_PALETTES[(section - 1) % SECTION_PALETTES.length];
}
