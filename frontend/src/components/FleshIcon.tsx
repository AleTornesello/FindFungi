import type { ReactNode } from "react"
import { CONVEX } from "./CapShapeIcon"
import { DrawingSvg, FILL, Ground, OUTLINE, Stipe, type DrawingProps } from "./mushroomDrawing"

/**
 * Flesh drawn as the convex mushroom of the cap shapes cut in half, so its inside shows:
 * pale throughout when it doesn't change, turning blue from the cut when it stains.
 */

// Inside of cap and stipe, inset from the outline so the skin still shows around it.
const CAP_FLESH = "M11 30.5 C11 18 20.5 12 32 12 S53 18 53 30.5Z"
const STIPE_FLESH = "M28.6 30 L35.4 30 L36.2 54.5 C36.2 56 35.5 56.5 34.5 56.5 L29.5 56.5 C28.5 56.5 27.8 56 27.8 54.5Z"

// Staining spreads from where cap and stipe meet; deepest at the centre.
const STAIN = [
  { d: "M15 30.5 C17 25 24 21.5 32 21.5 C40 21.5 47 25 49 30.5Z", fill: FILL.stain },
  { d: "M28.6 30 L35.4 30 L35.8 44 C34 46 30 46 28.2 44Z", fill: FILL.stain },
  { d: "M21 30.5 C23 27 27.5 25.5 32 25.5 C36.5 25.5 41 27 43 30.5Z", fill: FILL.stainDeep },
  { d: "M28.6 30 L35.4 30 L35.6 37 C34 38.5 30 38.5 28.4 37Z", fill: FILL.stainDeep },
]

const cutMushroom = (inside: ReactNode = null) => (
  <>
    <Ground />
    <Stipe top={CONVEX.stipeTop} />
    <path d={CONVEX.cap} fill={FILL.cap} {...OUTLINE} />
    <path d={CAP_FLESH} fill={FILL.flesh} />
    <path d={STIPE_FLESH} fill={FILL.flesh} />
    {inside}
  </>
)

const DRAWINGS: Record<string, ReactNode> = {
  unchanging: cutMushroom(),
  staining: cutMushroom(STAIN.map(({ d, fill }) => <path key={d} d={d} fill={fill} />)),
}

export const hasFleshDrawing = (type: string) => type in DRAWINGS

/** The section drawing for one flesh behaviour; renders nothing for types without one. */
export function FleshIcon({ type, ...rest }: { type: string } & DrawingProps) {
  const drawing = DRAWINGS[type]
  if (!drawing) return null
  return <DrawingSvg {...rest}>{drawing}</DrawingSvg>
}
