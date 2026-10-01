import type { ReactNode } from "react"
import { DETAIL, DrawingSvg, FILL, Ground, OUTLINE, Stipe, type DrawingProps } from "./mushroomDrawing"

/**
 * Hymenium types drawn as a section through the fruiting body, like the cap shapes. Gills,
 * pores, smooth and teeth share one convex cap so only the spore-bearing underside differs.
 */

// Convex cap whose underside runs from x=9 to x=55 at y=28.
const CAP = "M6 26 C6 13 18 8 32 8 S58 13 58 26 C58 28 56 29 54 29 L10 29 C8 29 6 28 6 26Z"
const STIPE_TOP = 29

/** Positions either side of the stipe (x 26–38), every `step` units across the underside. */
const acrossUnderside = (step: number) => {
  const xs: number[] = []
  for (let x = 11; x <= 53; x += step) if (x < 25 || x > 39) xs.push(x)
  return xs
}

/** Depth of a layer hanging under the cap at x: deepest by the stipe, thinning to the rim. */
const depthAt = (x: number, depth: number) => depth * Math.sqrt(Math.max(0, 1 - ((x - 32) / 24) ** 2))

/** Layer under the cap whose lower edge follows depthAt. */
const layer = (depth: number) => {
  const points = []
  for (let x = 55; x >= 9; x -= 2) points.push(`${x} ${(28 + depthAt(x, depth)).toFixed(1)}`)
  return `M9 28 L55 28 L${points.join(" L")}Z`
}

const capped = (underside: ReactNode) => (
  <>
    <Ground />
    {underside}
    <Stipe top={STIPE_TOP} />
    <path d={CAP} fill={FILL.cap} {...OUTLINE} />
  </>
)

const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${64 - Number(x)} ${y}`)

// Forking ridges of a chanterelle, running from the rim down onto the stipe.
const RIDGES = ["M11 23.5 C16 26 22 30 26.5 39", "M17 23.5 C21 26 24 29 27 35", "M14 25 L15.5 23.5", "M21 27 L23 23.5"]

const DRAWINGS: Record<string, ReactNode> = {
  // Gills: parallel plates with rounded edges, hanging deepest midway to the rim.
  gills: capped(
    acrossUnderside(3).map((x) => {
      const bottom = Math.max(31, 28 + depthAt(x, 10))
      return (
        <path
          key={x}
          d={`M${x - 1.1} 28 L${x + 1.1} 28 L${x + 1.1} ${bottom - 1} Q${x + 1.1} ${bottom} ${x} ${bottom} Q${x - 1.1} ${bottom} ${x - 1.1} ${bottom - 1}Z`}
          fill={FILL.hymenium}
          {...OUTLINE}
          strokeWidth={1}
        />
      )
    }),
  ),
  // Pores: a thick sponge of packed tubes.
  pores: capped(
    <>
      <path d={layer(13)} fill={FILL.hymenium} {...OUTLINE} />
      {acrossUnderside(2).map((x) => (
        <path key={x} d={`M${x} 29.5 V${27.5 + depthAt(x, 13)}`} {...DETAIL} strokeWidth={0.8} />
      ))}
    </>,
  ),
  smooth: capped(<path d={layer(3)} fill={FILL.hymenium} {...OUTLINE} />),
  // Teeth: separate tapering spines.
  teeth: capped(
    <>
      {acrossUnderside(4).map((x, i) => {
        const tip = 33 + depthAt(x, 5) + (i % 2) * 2
        return <path key={x} d={`M${x - 1.8} 28.5 L${x} ${tip} L${x + 1.8} 28.5Z`} fill={FILL.hymenium} {...OUTLINE} strokeWidth={1} />
      })}
      <path d={layer(1.5)} fill={FILL.hymenium} {...OUTLINE} strokeWidth={1} />
    </>,
  ),
  ridges: (
    <>
      <Ground />
      <Stipe top={39} />
      <path d="M9 23 L55 23 C50 26 42 30 38 40 L26 40 C22 30 14 26 9 23Z" fill={FILL.hymenium} {...OUTLINE} />
      {RIDGES.flatMap((d) => [d, mirror(d)]).map((d) => (
        <path key={d} d={d} fill="none" {...DETAIL} strokeWidth={1.2} />
      ))}
      <path
        d="M5 20 C5 15 12 13 20 15 C25 16 28 18 32 18 C36 18 39 16 44 15 C52 13 59 15 59 20 C59 22 57 23 55 23 L9 23 C7 23 5 22 5 20Z"
        fill={FILL.cap}
        {...OUTLINE}
      />
    </>
  ),
  // A puffball cut in half: spore mass inside a skin, over a sterile base.
  glebal: (
    <>
      <Ground />
      <path d="M15 52 C10 44 11 24 32 19 C53 24 54 44 49 52 C45 57 40 58 32 58 C24 58 19 57 15 52Z" fill={FILL.body} {...OUTLINE} />
      <path d="M18 43 C16 35 19 26 32 23 C45 26 48 35 46 43 C41 46 23 46 18 43Z" fill={FILL.gleba} {...OUTLINE} strokeWidth={1} />
      {[
        [26, 32],
        [33, 29],
        [39, 34],
        [30, 39],
        [37, 41],
        [23, 38],
        [42, 39],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} fill={FILL.hymenium} />
      ))}
    </>
  ),
}

export const hasHymeniumDrawing = (type: string) => type in DRAWINGS

/** The section drawing for one hymenium type; renders nothing for types without one. */
export function HymeniumIcon({ type, ...rest }: { type: string } & DrawingProps) {
  const drawing = DRAWINGS[type]
  if (!drawing) return null
  return <DrawingSvg {...rest}>{drawing}</DrawingSvg>
}
