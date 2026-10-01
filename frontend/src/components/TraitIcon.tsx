import type { Mushroom } from "../data/mushrooms"
import { CapShapeIcon, hasCapDrawing } from "./CapShapeIcon"
import { EcologyIcon, hasEcologyDrawing } from "./EcologyIcon"
import { FleshIcon, hasFleshDrawing } from "./FleshIcon"
import { GillAttachmentIcon, hasGillAttachmentDrawing } from "./GillAttachmentIcon"
import { HymeniumIcon, hasHymeniumDrawing } from "./HymeniumIcon"
import type { DrawingProps } from "./mushroomDrawing"
import { hasStipeDrawing, StipeIcon } from "./StipeIcon"

/** Characteristics that have section drawings, and which single values are drawn. */
const DRAWN: Partial<Record<keyof Mushroom["properties"], (value: string) => boolean>> = {
  cap: hasCapDrawing,
  hymenium: hasHymeniumDrawing,
  lamella: hasGillAttachmentDrawing,
  stipe: hasStipeDrawing,
  gleba: hasFleshDrawing,
  ecology: hasEcologyDrawing,
}

export const hasTraitDrawing = (property: string, value: string) =>
  DRAWN[property as keyof Mushroom["properties"]]?.(value) ?? false

/** Drawing of one characteristic value; renders nothing when it has none. */
export function TraitIcon({ property, value, ...rest }: { property: string; value: string } & DrawingProps) {
  if (property === "cap") return <CapShapeIcon shape={value} {...rest} />
  if (property === "hymenium") return <HymeniumIcon type={value} {...rest} />
  if (property === "lamella") return <GillAttachmentIcon type={value} {...rest} />
  if (property === "stipe") return <StipeIcon type={value} {...rest} />
  if (property === "gleba") return <FleshIcon type={value} {...rest} />
  if (property === "ecology") return <EcologyIcon type={value} {...rest} />
  return null
}
