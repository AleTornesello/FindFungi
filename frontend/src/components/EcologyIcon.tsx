import type { ReactNode } from "react"
import { CONVEX } from "./CapShapeIcon"
import { DrawingSvg, FILL, OUTLINE, stipePath, type DrawingProps } from "./mushroomDrawing"

/**
 * Ecology drawn as the convex mushroom of the cap shapes in its habitat, with the soil cut
 * away to show where its mycelium (pale threads) feeds: on tree roots, in dead wood, or
 * inside a living tree.
 */

const SURFACE = 46

/** The standard mushroom shrunk to stand at (x, y); outlines keep their usual width. */
function SmallMushroom({ x, y, scale }: { x: number; y: number; scale: number }) {
  const stroke = { ...OUTLINE, strokeWidth: OUTLINE.strokeWidth / scale }
  return (
    <g transform={`translate(${x - 32 * scale} ${y - 58 * scale}) scale(${scale})`}>
      <path d={stipePath(CONVEX.stipeTop)} fill={FILL.stipe} {...stroke} />
      <path d={CONVEX.cap} fill={FILL.cap} {...stroke} />
    </g>
  )
}

const Earth = () => (
  <path d={`M2 ${SURFACE} H62 V58 C62 60 61 61 59 61 H5 C3 61 2 60 2 58Z`} fill={FILL.earth} {...OUTLINE} />
)

const Hyphae = ({ paths }: { paths: string[] }) =>
  paths.map((d) => <path key={d} d={d} fill="none" stroke={FILL.hypha} strokeWidth={0.9} />)

const Roots = ({ paths }: { paths: string[] }) =>
  paths.map((d) => <path key={d} d={d} fill="none" stroke={FILL.wood} strokeWidth={2} />)

const DRAWINGS: Record<string, ReactNode> = {
  // Beside a living tree, its threads wrapping the tree's roots.
  mycorrhizal: (
    <>
      <Earth />
      <Roots paths={["M47 46 C45 50 41 53 36 55", "M47 46 C49 50 53 52 58 53", "M47 46 C47 50 46 54 47 58"]} />
      <Hyphae
        paths={["M18 47 C22 51 29 54 36 55", "M18 47 C24 49 34 49 44 51", "M18 47 C17 51 14 54 10 56", "M36 55 C40 57 44 57.5 47 57"]}
      />
      <path d="M44.5 46 L45.5 28 L48.5 28 L49.5 46Z" fill={FILL.wood} {...OUTLINE} />
      <circle cx={47} cy={19} r={13} fill={FILL.leaf} {...OUTLINE} />
      <SmallMushroom x={18} y={SURFACE} scale={0.55} />
    </>
  ),
  // On a fallen dead log, its threads running through the rotting wood.
  saprotrophic: (
    <>
      <Earth />
      <path d="M8 34 H50 V46 H8 C5.5 46 4 43 4 40 C4 37 5.5 34 8 34Z" fill={FILL.wood} {...OUTLINE} />
      <path d="M50 34 C54 34 57 37 57 40 C57 43 54 46 50 46 C46 46 43 43 43 40 C43 37 46 34 50 34Z" fill={FILL.woodCut} {...OUTLINE} />
      <circle cx={50} cy={40} r={2.5} fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.6} />
      <Hyphae paths={["M26 35 C22 37 16 38 9 41", "M26 35 C30 37.5 36 38.5 42 41", "M26 35 C25 39 21 42 16 44.5", "M26 35 C28 39 31 42 36 44"]} />
      <SmallMushroom x={26} y={34.5} scale={0.5} />
    </>
  ),
  // Brackets on a living tree, its threads spreading inside the trunk.
  parasitic: (
    <>
      <Earth />
      <Roots paths={["M22 46 C19 50 14 52 9 53", "M22 46 C25 50 30 52 36 53"]} />
      <path d="M17 46 L18.5 16 L25.5 16 L27 46Z" fill={FILL.wood} {...OUTLINE} />
      <Hyphae paths={["M26 30 C23 32 21.5 37 21 43", "M26 30 C24 26 22 22 21 18", "M26 40 C24 41 22 43 20.5 45"]} />
      <circle cx={22} cy={13} r={12} fill={FILL.leaf} {...OUTLINE} />
      <path d="M26.3 24 C34 23 44 26 51 31 C53 33 51.5 35 48.5 35 C41 35 34 35 26.6 36Z" fill={FILL.cap} {...OUTLINE} />
      <path d="M26.7 37 C32 36.5 38 38 41.5 40.5 C43 42 42 43.3 40 43.3 C36 43.3 31 43.2 26.9 43.6Z" fill={FILL.cap} {...OUTLINE} />
    </>
  ),
}

export const hasEcologyDrawing = (type: string) => type in DRAWINGS

/** The drawing for one ecology; renders nothing for types without one. */
export function EcologyIcon({ type, ...rest }: { type: string } & DrawingProps) {
  const drawing = DRAWINGS[type]
  if (!drawing) return null
  return <DrawingSvg {...rest}>{drawing}</DrawingSvg>
}
