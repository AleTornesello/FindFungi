import { Badge, type BadgeProps } from "@chakra-ui/react"
import { Skull } from "lucide-react"
import type { Mushroom } from "../data/mushrooms"
import { useI18n } from "../i18n/I18nProvider"

/** Edible / not edible; poisonous species get a solid red badge that stands out at any size. */
export function EdibilityBadge({ properties, ...rest }: { properties: Mushroom["properties"] } & BadgeProps) {
  const { t } = useI18n()
  if (properties.poisonous) {
    return (
      <Badge colorPalette="amanita" variant="solid" borderRadius="full" fontWeight="700" {...rest}>
        <Skull size={14} aria-hidden />
        {t("edibility.poisonous")}
      </Badge>
    )
  }
  return (
    <Badge colorPalette={properties.edible ? "moss" : "soil"} variant="subtle" borderRadius="full" {...rest}>
      {properties.edible ? t("edibility.edible") : t("edibility.inedible")}
    </Badge>
  )
}
