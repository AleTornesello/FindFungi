import type { ReactNode } from "react"
import { DETAIL, DrawingSvg, FILL, Ground, mirror, OUTLINE, Stipe, type DrawingProps } from "./mushroomDrawing"

/**
 * Gill attachments drawn like the cap shapes: a section through cap and stipe showing one gill
 * on each side, so only how the gill's inner end meets the stipe changes between drawings.
 * Gills are drawn for the left half (cap underside at y=24, stipe edge at x≈27.4) and mirrored.
 */

const CAP = "M4 22 C4 10 16 5 32 5 C48 5 60 10 60 22 C60 23.5 59 24 57.5 24 L6.5 24 C5 24 4 23.5 4 22Z"
const STIPE_TOP = 24

// Outer half of a gill, from its inner end at the bottom back up to the rim.
const OUTER = "C13 35.5 9 31 7 24Z"

interface GillDrawing {
  gill: string
  /** Extra marks on the stipe, e.g. the lines a seceding gill leaves behind. */
  marks?: string
}

const DRAWINGS: Record<string, GillDrawing> = {
  // Ends short of the stipe.
  free: { gill: "M7 24 L23.5 24 C24 28 23 33 19 34.5 C14 35.5 9 31 7 24Z" },
  // Touches the stipe over only a little of its depth.
  adnexed: { gill: `M7 24 L27.4 24 L27.4 26.5 C25 30 23 34 18 35 ${OUTER}` },
  // Meets the stipe along its whole depth.
  adnate: { gill: `M7 24 L27.4 24 L27.2 35 C24 35.5 21 35.5 18 35 ${OUTER}` },
  // Curves up in a smooth notch just before joining the stipe.
  sinuate: { gill: `M7 24 L27.4 24 L27.2 31.5 C26.5 30 25.5 29 24 29.5 C22 30.5 21.5 34 18 35 ${OUTER}` },
  // Cut in by a sharp step just before joining the stipe.
  emarginate: { gill: `M7 24 L27.4 24 L27.3 29.5 L24 29.5 L23 34.5 C21 35.5 19.5 35.5 18 35 ${OUTER}` },
  // Notched, then hooked down along the stipe.
  uncinate: { gill: `M7 24 L27.4 24 L27.1 38 C26.5 34 25.5 30 24 30 C22 30 21.5 34.5 18 35 ${OUTER}` },
  // Runs a short way down the stipe.
  subdecurrent: { gill: "M7 24 L27.4 24 L27.1 38.5 C25 36.5 22 35.5 18 35 C13 34 9 30 7 24Z" },
  // Runs well down the stipe, tapering.
  decurrent: { gill: "M7 24 L27.4 24 L26.9 45 C25.5 40.5 22.5 36.5 18 34.5 C13 32.5 9 29.5 7 24Z" },
  // Was attached, then pulled away, leaving lines on the stipe.
  seceding: {
    gill: `M7 24 L25 24 L25 33.5 C23 35 21 35.5 18 35 ${OUTER}`,
    marks: "M28.8 25.5 V33",
  },
  // Wavy edge with an uneven attachment.
  irregular: {
    gill: "M7 24 L27.4 24 L27.3 29 C25.5 30 25.5 32 24 33 C22 34 21 32 19 34 C16.5 36 14.5 32.5 12.5 32.5 C9.5 31 8 28 7 24Z",
  },
}

export const hasGillAttachmentDrawing = (type: string) => type in DRAWINGS

/** The section drawing for one gill attachment; renders nothing for types without one. */
export function GillAttachmentIcon({ type, ...rest }: { type: string } & DrawingProps) {
  const d = DRAWINGS[type]
  if (!d) return null
  const halves: ReactNode[] = [d.gill, mirror(d.gill)].map((path) => (
    <path key={path} d={path} fill={FILL.hymenium} {...OUTLINE} strokeWidth={1.2} />
  ))
  return (
    <DrawingSvg {...rest}>
      <Ground />
      <Stipe top={STIPE_TOP} />
      {halves}
      {d.marks &&
        [d.marks, mirror(d.marks)].map((path) => (
          <path key={path} d={path} fill="none" {...DETAIL} strokeDasharray="1.5 1.5" />
        ))}
      <path d={CAP} fill={FILL.cap} {...OUTLINE} />
    </DrawingSvg>
  )
}
