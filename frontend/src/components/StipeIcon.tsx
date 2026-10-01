import type { ReactNode } from "react"
import { CONVEX } from "./CapShapeIcon"
import { DETAIL, DrawingSvg, FILL, Ground, mirror, OUTLINE, Stipe, type DrawingProps } from "./mushroomDrawing"

/**
 * Stipe types drawn on the convex mushroom of the cap shapes, so only the stipe and the veil
 * remains on it change between drawings.
 */

// Membranous skirt hanging from the upper stipe.
const RING = "M27.3 37 L36.7 37 C38.5 38.5 40.5 40 41.5 42 C40 43 37 42.5 32 42.5 C27 42.5 24 43 22.5 42 C23.5 40 25.5 38.5 27.3 37Z"

// Torn sac cupping the base of the stipe; drawn behind it, so in section only its walls show.
const VOLVA = "M20 58 C17 52 18 46 22 42 C23.5 45 25 47 27 48 L37 48 C39 47 40.5 45 42 42 C46 46 47 52 44 58Z"

// Cobweb threads from the cap margin to the stipe, left half.
const CORTINA = ["M10 33 C15 37 21 39 27.2 39", "M13 33 C17 36 22 37.5 27.3 37.5", "M10 33 C15 39 21 41.5 27.1 41.5", "M16 33 C20 35 23.5 36 27.3 36"]

const mushroom = ({ behind, front }: { behind?: ReactNode; front?: ReactNode } = {}) => (
  <>
    <Ground />
    {behind}
    <Stipe top={CONVEX.stipeTop} />
    {front}
    <path d={CONVEX.cap} fill={FILL.cap} {...OUTLINE} />
  </>
)

const DRAWINGS: Record<string, ReactNode> = {
  bare: mushroom(),
  ring: mushroom({ front: <path d={RING} fill={FILL.veil} {...OUTLINE} strokeWidth={1.2} /> }),
  volva: mushroom({ behind: <path d={VOLVA} fill={FILL.veil} {...OUTLINE} strokeWidth={1.2} /> }),
  "ring and volva": mushroom({
    behind: <path d={VOLVA} fill={FILL.veil} {...OUTLINE} strokeWidth={1.2} />,
    front: <path d={RING} fill={FILL.veil} {...OUTLINE} strokeWidth={1.2} />,
  }),
  cortina: mushroom({
    front: CORTINA.flatMap((d) => [d, mirror(d)]).map((d) => (
      <path key={d} d={d} fill="none" {...DETAIL} strokeWidth={0.8} />
    )),
  }),
  // A cap sitting straight on the wood it grows from.
  "no stipe": (
    <>
      <path d="M6 44 H58 C60 44 61 47 61 51 C61 55 60 58 58 58 H6 C4 58 3 55 3 51 C3 47 4 44 6 44Z" fill={FILL.substrate} {...OUTLINE} />
      <path d="M57.5 46.5 C56 48 56 54 57.5 55.5" fill="none" {...DETAIL} />
      <path d={`M10 44 C10 31 19 25 32 25 S54 31 54 44 C48 45.5 16 45.5 10 44Z`} fill={FILL.cap} {...OUTLINE} />
    </>
  ),
}

export const hasStipeDrawing = (type: string) => type in DRAWINGS

/** The section drawing for one stipe type; renders nothing for types without one. */
export function StipeIcon({ type, ...rest }: { type: string } & DrawingProps) {
  const drawing = DRAWINGS[type]
  if (!drawing) return null
  return <DrawingSvg {...rest}>{drawing}</DrawingSvg>
}
