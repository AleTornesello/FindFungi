import { DrawingSvg, FILL, Ground, OUTLINE, Stipe, type DrawingProps } from "./mushroomDrawing"

/**
 * Cap shapes drawn as a vertical section through the fruiting body, in the manner of the
 * icons in it.wikipedia's Template:Fungo. `stipeTop` is where the stipe meets the underside of the cap, or undefined when the
 * drawing has no separate stipe.
 */
interface CapDrawing {
  cap: string
  stipeTop?: number
  /** Extra outline drawn dashed, e.g. the young form of a cap that changes shape. */
  ghost?: string
  /** Substrate drawn behind, e.g. the trunk a bracket grows from. */
  substrate?: string
}

// Rim and underside shared by caps whose margin sits at y: a slightly lifted gill line.
const underside = (left: number, right: number, y: number) =>
  `C${right} ${y + 2} ${right - 2} ${y + 3} ${right - 4} ${y + 3} L${left + 4} ${y + 3} C${left + 2} ${y + 3} ${left} ${y + 2} ${left} ${y}Z`

const DRAWINGS: Record<string, CapDrawing> = {
  convex: { cap: `M8 30 C8 15 19 9 32 9 S56 15 56 30 ${underside(8, 56, 30)}`, stipeTop: 33 },
  flat: { cap: `M6 27 C6 22 12 20 20 20 L44 20 C52 20 58 22 58 27 ${underside(6, 58, 27)}`, stipeTop: 30 },
  hemispherical: { cap: `M10 33 A22 22 0 0 1 54 33 ${underside(10, 54, 33)}`, stipeTop: 36 },
  campanulate: {
    cap: "M9 36 C14 34 15 30 16 22 C17 12 24 6 32 6 C40 6 47 12 48 22 C49 30 50 34 55 36 C51 38 47 38 44 37 L20 37 C17 38 13 38 9 36Z",
    stipeTop: 37,
  },
  "campanulate-conical": {
    cap: "M9 36 C14 34 15 30 17 22 C20 12 29 5 32 3 C35 5 44 12 47 22 C49 30 50 34 55 36 C51 38 47 38 44 37 L20 37 C17 38 13 38 9 36Z",
    stipeTop: 37,
  },
  conical: {
    cap: "M11 36 L28 9 C30 5 34 5 36 9 L53 36 C50 38 47 38 44 37 L20 37 C17 38 14 38 11 36Z",
    stipeTop: 37,
  },
  "acute conical": {
    cap: "M14 38 L31 4 C31.5 3 32.5 3 33 4 L50 38 C47 40 45 40 42 39 L22 39 C19 40 17 40 14 38Z",
    stipeTop: 39,
  },
  "blunt conical": {
    cap: "M10 36 L23 13 C27 6 37 6 41 13 L54 36 C51 38 47 38 44 37 L20 37 C17 38 13 38 10 36Z",
    stipeTop: 37,
  },
  umbonate: {
    cap: `M6 30 C6 22 14 18 22 17 C25 16 27 11 32 11 C37 11 39 16 42 17 C50 18 58 22 58 30 ${underside(6, 58, 30)}`,
    stipeTop: 33,
  },
  "acute umbonate": {
    cap: `M6 30 C6 22 14 18 22 17 C26 16 30 9 32 5 C34 9 38 16 42 17 C50 18 58 22 58 30 ${underside(6, 58, 30)}`,
    stipeTop: 33,
  },
  umbilicate: {
    cap: `M8 30 C8 16 17 10 25 10 C28 10 29 14 32 14 C35 14 36 10 39 10 C47 10 56 16 56 30 ${underside(8, 56, 30)}`,
    stipeTop: 33,
  },
  depressed: {
    cap: "M6 24 C6 20 10 18 16 19 C22 20 26 25 32 25 C38 25 42 20 48 19 C54 18 58 20 58 24 C58 30 52 33 44 33 L20 33 C12 33 6 30 6 24Z",
    stipeTop: 33,
  },
  infundibuliform: {
    cap: "M4 12 C10 12 14 14 20 20 C25 25 28 28 32 28 C36 28 39 25 44 20 C50 14 54 12 60 12 C61 14 58 18 52 24 C46 30 41 35 38 39 L26 39 C23 35 18 30 12 24 C6 18 3 14 4 12Z",
    stipeTop: 38,
  },
  ovate: {
    cap: "M14 38 C11 26 14 6 32 6 C50 6 53 26 50 38 C47 40 45 40 42 39 L22 39 C19 40 17 40 14 38Z",
    stipeTop: 39,
  },
  cylindrical: {
    cap: "M18 42 L18 14 C18 7 24 4 32 4 C40 4 46 7 46 14 L46 42 C44 44 42 44 40 43 L24 43 C22 44 20 44 18 42Z",
    stipeTop: 43,
  },
  undulate: {
    cap: `M6 28 C8 22 12 25 16 21 C20 17 24 21 28 18 C32 15 36 19 40 17 C44 15 48 21 52 21 C56 22 58 24 58 28 ${underside(6, 58, 28)}`,
    stipeTop: 31,
  },
  "conical then flat": {
    cap: `M6 27 C6 22 12 21 20 20 C26 19 28 17 32 17 C36 17 38 19 44 20 C52 21 58 22 58 27 ${underside(6, 58, 27)}`,
    stipeTop: 30,
    ghost: "M14 33 L29 8 C30.5 5 33.5 5 35 8 L50 33",
  },
  offset: {
    substrate: "M2 2 L12 2 L12 62 L2 62Z",
    cap: "M12 16 C28 14 46 20 58 30 C61 33 58 36 54 36 C40 37 26 38 12 42Z",
  },
  indistinct: {
    cap: "M26 58 L27 32 C21 30 14 25 14 19 C14 12 23 10 32 10 C41 10 50 12 50 19 C50 25 43 30 37 32 L38 58Z",
  },
  "no distinct cap": {
    cap: "M21 58 C19 49 14 41 14 31 C14 18 22 10 32 10 C42 10 50 18 50 31 C50 41 45 49 43 58Z",
  },
}

/** The plain convex mushroom, reused by drawings of other traits so they share one silhouette. */
export const CONVEX = DRAWINGS.convex as Required<Pick<CapDrawing, "cap" | "stipeTop">>

/** True when there's a drawing for this single cap shape (not a compound like "convex or flat"). */
export const hasCapDrawing = (shape: string) => shape in DRAWINGS

type Props = { shape: string } & DrawingProps

/** The section drawing for one cap shape; renders nothing for shapes without one. */
export function CapShapeIcon({ shape, ...rest }: Props) {
  const d = DRAWINGS[shape]
  if (!d) return null
  return (
    <DrawingSvg {...rest}>
      {d.substrate ? <path d={d.substrate} fill={FILL.substrate} {...OUTLINE} /> : <Ground />}
      {d.stipeTop !== undefined && <Stipe top={d.stipeTop} />}
      {d.ghost && <path d={d.ghost} fill="none" {...OUTLINE} strokeDasharray="3 3" opacity={0.55} />}
      <path d={d.cap} fill={d.stipeTop === undefined && !d.substrate ? FILL.body : FILL.cap} {...OUTLINE} />
    </DrawingSvg>
  )
}
