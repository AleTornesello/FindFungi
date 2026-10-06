import { Box, HStack, LinkBox, LinkOverlay, Text } from "@chakra-ui/react"
import { Link } from "react-router"
import { scientificName, speciesPath, type Mushroom } from "../data/mushrooms"
import { MushroomPhoto } from "./MushroomPhoto"
import { EdibilityBadge } from "./EdibilityBadge"
import { useI18n } from "../i18n/I18nProvider"
import type { MessageKey } from "../i18n/locales/en"
import { useValueLabel } from "../hooks/useMushrooms"

const FEATURES: { key: keyof Mushroom["properties"]; label: MessageKey }[] = [
  { key: "cap", label: "field.cap" },
  { key: "hymenium", label: "field.hymenium" },
  { key: "stipe", label: "field.stipe" },
  { key: "sporePrint", label: "field.sporePrint" },
  { key: "ecology", label: "field.ecology" },
]

export function MushroomCard({ mushroom }: { mushroom: Mushroom }) {
  const { taxonomy, properties } = mushroom
  const { t } = useI18n()
  const valueLabel = useValueLabel()
  const features = FEATURES.filter((f) => {
    const v = properties[f.key]
    return typeof v === "string" && v && v !== "not applicable"
  })

  return (
    <LinkBox
      as="article"
      bg="bg.panel"
      borderRadius="2xl"
      borderWidth={properties.poisonous ? "2px" : "1px"}
      borderColor={properties.poisonous ? "amanita.solid" : "border"}
      overflow="hidden"
      h="full"
      transition="border-color 0.15s, transform 0.15s, box-shadow 0.15s"
      _hover={{
        borderColor: properties.poisonous ? "amanita.solid" : "soil.300",
        transform: "translateY(-2px)",
        boxShadow: "0 6px 18px rgba(46,31,20,.08)",
      }}
    >
      <MushroomPhoto src={properties.images[0]?.url} h="36" />
      <Box p="4">
        <HStack justify="space-between" align="flex-start" gap="2">
          <Box minW="0">
            <Text fontFamily="heading" fontWeight="700" fontSize="lg" lineHeight="1.2" fontStyle="italic">
              <LinkOverlay asChild>
                <Link to={speciesPath(mushroom)}>{scientificName(mushroom)}</Link>
              </LinkOverlay>
            </Text>
            {taxonomy.family && (
              <Text color="fg.muted" fontSize="sm">
                {taxonomy.family}
              </Text>
            )}
          </Box>
          <EdibilityBadge properties={properties} px="2.5" flexShrink={0} />
        </HStack>
        {features.length > 0 && (
          <Box as="dl" mt="3" fontSize="sm" display="grid" gridTemplateColumns="auto 1fr" columnGap="3" rowGap="0.5">
            {features.map((f) => (
              <Box key={f.key} display="contents">
                <Text as="dt" color="fg.muted">
                  {t(f.label)}
                </Text>
                <Text as="dd">{valueLabel(f.key, properties[f.key] as string)}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </LinkBox>
  )
}
