import { useEffect, useMemo, type ReactNode } from "react"
import { Badge, Box, Button, Container, Flex, Grid, Heading, HStack, Link, SimpleGrid, Spinner, Stack, Text } from "@chakra-ui/react"
import { Link as RouterLink, useLocation, useNavigate, useParams } from "react-router"
import { ArrowLeft, ChevronRight, ExternalLink, Microscope, ShieldAlert, Skull, TriangleAlert, Utensils, type LucideIcon } from "lucide-react"
import { commonName, scientificName, type Mushroom } from "../data/mushrooms"
import { isThreatened } from "../data/conservation"
import { hasTraitDrawing, TraitIcon } from "../components/TraitIcon"
import { MushroomCard } from "../components/MushroomCard"
import { EdibilityBadge } from "../components/EdibilityBadge"
import { MushroomPhoto } from "../components/MushroomPhoto"
import { PhotoGallery } from "../components/PhotoGallery"
import { SporePrintSwatch } from "../components/SporePrintSwatch"
import { useMushrooms, useValueLabel } from "../hooks/useMushrooms"
import { useI18n } from "../i18n/I18nProvider"
import { usePageMeta } from "../hooks/usePageMeta"
import { notFoundMeta, speciesMeta } from "../seo"
import type { MessageKey } from "../i18n/locales/en"

type Property = keyof Mushroom["properties"]

const CHARACTERISTIC_GROUPS: { title: MessageKey; fields: { key: Property; label: MessageKey }[] }[] = [
  {
    title: "detail.group.fruitingBody",
    fields: [
      { key: "cap", label: "field.cap" },
      { key: "hymenium", label: "field.hymenium" },
      { key: "lamella", label: "field.lamella" },
      { key: "stipe", label: "field.stipe" },
      { key: "gleba", label: "field.gleba" },
    ],
  },
  {
    title: "detail.group.spores",
    fields: [{ key: "sporePrint", label: "field.sporePrint" }],
  },
  {
    title: "detail.group.habitat",
    fields: [
      { key: "ecology", label: "field.ecology" },
      { key: "conservationStatus", label: "field.conservationStatus" },
    ],
  },
]

const RANKS: { key: keyof Mushroom["taxonomy"]; label: MessageKey }[] = [
  { key: "kingdom", label: "field.kingdom" },
  { key: "division", label: "field.division" },
  { key: "class", label: "field.class" },
  { key: "order", label: "field.order" },
  { key: "family", label: "field.family" },
  { key: "genus", label: "field.genus" },
  { key: "species", label: "field.species" },
]

const RELATED_LIMIT = 6

const hasValue = (v: unknown): v is string => typeof v === "string" && v !== "" && v !== "not applicable"

export function MushroomDetailPage() {
  const { id } = useParams()
  const { mushrooms, status } = useMushrooms()
  const { t } = useI18n()
  const mushroom = mushrooms.find((m) => String(m.id) === id)

  // Moving between related species keeps the scroll position otherwise.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  const loading = !mushroom && mushrooms.length === 0 && (status === "loading" || status === "syncing")
  // While the guide loads, keep the head the static page for this route was built with.
  usePageMeta(mushroom ? speciesMeta(mushroom, t) : loading ? null : notFoundMeta(t, `/species/${id}`, ["detail.notFoundTitle", "detail.notFoundBody"]))

  if (!mushroom) {
    return (
      <Container maxW="md" px="4" pt="16" textAlign="center">
        {loading ? (
          <Stack align="center" gap="4" color="fg.muted">
            <Spinner size="lg" color="moss.500" />
            <Text>{t("detail.loading")}</Text>
          </Stack>
        ) : (
          <>
            <Heading as="h1" fontSize="4xl" fontWeight="800">
              {t("detail.notFoundTitle")}
            </Heading>
            <Text color="fg.muted" mt="3">
              {t("detail.notFoundBody")}
            </Text>
            <Button asChild mt="6" borderRadius="full" colorPalette="moss">
              <RouterLink to="/">{t("notFound.cta")}</RouterLink>
            </Button>
          </>
        )}
      </Container>
    )
  }

  return (
    <Container maxW="6xl" px={{ base: "4", md: "6" }} pt={{ base: "4", md: "6" }}>
      <BackLink />
      {mushroom.properties.poisonous && <PoisonWarning mushroom={mushroom} />}
      {isThreatened(mushroom.properties.conservationStatus) && <ConservationWarning mushroom={mushroom} />}
      <Hero mushroom={mushroom} />

      <Grid templateColumns={{ base: "1fr", lg: "1fr 340px" }} gap={{ base: "6", lg: "8" }} mt={{ base: "8", md: "10" }} alignItems="start">
        <Stack gap="6" minW="0">
          <Characteristics mushroom={mushroom} />
          <CommonNames mushroom={mushroom} />
          <Photos mushroom={mushroom} />
        </Stack>
        <Stack gap="6">
          <Classification mushroom={mushroom} />
          <LearnMore mushroom={mushroom} />
        </Stack>
      </Grid>

      <Related mushroom={mushroom} />
    </Container>
  )
}

/** Goes back when we came from inside the app, so the explore page keeps the user's place. */
function BackLink() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const cameFromApp = location.key !== "default"
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      borderRadius="full"
      color="fg.muted"
      ms="-3"
      onClick={(e) => {
        if (!cameFromApp) return
        e.preventDefault()
        navigate(-1)
      }}
    >
      <RouterLink to="/">
        <ArrowLeft />
        {t("detail.back")}
      </RouterLink>
    </Button>
  )
}

function Hero({ mushroom }: { mushroom: Mushroom }) {
  const { t } = useI18n()
  const valueLabel = useValueLabel()
  const { taxonomy, properties } = mushroom
  const lineage = [taxonomy.order, taxonomy.family].filter(Boolean)
  const atGlance = (["hymenium", "sporePrint", "ecology"] as const).filter((k) => hasValue(properties[k]))

  return (
    <Grid templateColumns={{ base: "1fr", md: "minmax(0, 5fr) minmax(0, 6fr)" }} gap={{ base: "5", md: "8" }} mt="2" alignItems="center">
      <MushroomPhoto
        src={properties.images[0]?.url}
        alt={scientificName(mushroom)}
        aspectRatio="4 / 3"
        borderRadius="3xl"
        borderWidth="1px"
        borderColor="border"
        illustrationWidth="40"
      />

      <Box minW="0">
        {lineage.length > 0 && (
          <HStack gap="1" color="fg.muted" fontSize="sm" fontWeight="600" flexWrap="wrap">
            {lineage.map((name, i) => (
              <HStack key={name} gap="1">
                {i > 0 && <ChevronRight size={14} aria-hidden />}
                <Text>{name}</Text>
              </HStack>
            ))}
          </HStack>
        )}
        <Heading
          as="h1"
          mt="1"
          fontSize={{ base: "4xl", md: "5xl" }}
          fontWeight="800"
          fontStyle="italic"
          letterSpacing="-0.03em"
          lineHeight="1.05"
          overflowWrap="anywhere"
        >
          {scientificName(mushroom)}
        </Heading>

        <Flex mt="4" gap="2" wrap="wrap">
          <EdibilityBadge properties={properties} px="3" py="1" fontSize="sm" />
          {properties.microscopic && (
            <Badge colorPalette="lichen" variant="subtle" borderRadius="full" px="3" py="1" fontSize="sm">
              <Microscope size={14} aria-hidden />
              {t("detail.microscopyBadge")}
            </Badge>
          )}
          {hasValue(properties.conservationStatus) && (
            <Badge
              colorPalette={isThreatened(properties.conservationStatus) ? "chanterelle" : "soil"}
              variant="subtle"
              borderRadius="full"
              px="3"
              py="1"
              fontSize="sm"
            >
              {valueLabel("conservationStatus", properties.conservationStatus)}
            </Badge>
          )}
        </Flex>

        {atGlance.length > 0 && (
          <Box mt="5">
            <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.08em" color="fg.muted">
              {t("detail.atGlance")}
            </Text>
            <SimpleGrid as="dl" minChildWidth="120px" gap="2" mt="2">
              {atGlance.map((k) => (
                <Box key={k} bg="bg.panel" borderWidth="1px" borderColor="border" borderRadius="xl" px="3" py="2.5" minW="0">
                  <Text as="dt" fontSize="xs" color="fg.muted">
                    {t(`field.${k}` as MessageKey)}
                  </Text>
                  <HStack as="dd" gap="1.5">
                    {k === "sporePrint" && <SporePrintSwatch value={properties[k]} />}
                    <Text fontWeight="700" _firstLetter={{ textTransform: "uppercase" }}>
                      {valueLabel(k, properties[k])}
                    </Text>
                  </HStack>
                </Box>
              ))}
            </SimpleGrid>
          </Box>
        )}

        {!properties.poisonous && <EdibilityNote properties={properties} />}
      </Box>
    </Grid>
  )
}

/**
 * A pinned alert stays under the header while the page scrolls, so the warning is on screen whatever
 * part of the page is being read, on every screen size.
 */
function WarningBanner({
  icon: Icon,
  palette,
  title,
  sticky,
  children,
}: {
  icon: LucideIcon
  palette: string
  title: string
  sticky: boolean
  children: ReactNode
}) {
  return (
    <Flex
      position={sticky ? "sticky" : undefined}
      top={sticky ? "16" : undefined}
      zIndex={sticky ? "docked" : undefined}
      mt="2"
      align="flex-start"
      gap="3"
      px="4"
      py="3"
      borderRadius="xl"
      bg={`${palette}.solid`}
      color={`${palette}.contrast`}
      boxShadow="0 6px 18px rgba(46,31,20,.25)"
      role="alert"
    >
      <Box flexShrink={0} mt="0.5">
        <Icon size={22} aria-hidden />
      </Box>
      <Box minW="0">
        <Text fontWeight="800" fontSize="md" textTransform="uppercase" letterSpacing="0.04em">
          {title}
        </Text>
        {children}
      </Box>
    </Flex>
  )
}

function PoisonWarning({ mushroom }: { mushroom: Mushroom }) {
  const { t } = useI18n()
  return (
    <WarningBanner icon={Skull} palette="amanita" title={t("edibility.poisonous")} sticky>
      <Text fontSize="sm">{t("detail.poisonousNote")}</Text>
      <ToxicityEffect value={mushroom.properties.toxicityEffectIt} />
    </WarningBanner>
  )
}

/** Only one banner is pinned at a time; next to the poison warning this one scrolls with the page. */
function ConservationWarning({ mushroom }: { mushroom: Mushroom }) {
  const { t } = useI18n()
  const valueLabel = useValueLabel()
  const { conservationStatus, poisonous } = mushroom.properties
  return (
    <WarningBanner icon={ShieldAlert} palette="chanterelle" title={valueLabel("conservationStatus", conservationStatus)} sticky={!poisonous}>
      <Text fontSize="sm">{t("detail.threatenedNote")}</Text>
    </WarningBanner>
  )
}

/** The syndrome is recorded in Italian only, so it's shown only when the app is in Italian. */
function ToxicityEffect({ value }: { value: string }) {
  const { locale, t } = useI18n()
  if (locale !== "it" || !value) return null
  return (
    <Text fontSize="sm" mt="1">
      {t("detail.toxicityEffect")}:{" "}
      <Text as="span" fontWeight="700">
        {value}
      </Text>
    </Text>
  )
}

function EdibilityNote({ properties }: { properties: Mushroom["properties"] }) {
  const { t } = useI18n()
  const { edible } = properties
  const Icon: LucideIcon = edible ? Utensils : TriangleAlert
  return (
    <HStack
      mt="5"
      align="flex-start"
      gap="3"
      p="3.5"
      borderRadius="xl"
      bg={edible ? "chanterelle.subtle" : "bg.subtle"}
      color={edible ? "chanterelle.fg" : "fg"}
      fontSize="sm"
      role="note"
    >
      <Box flexShrink={0} mt="0.5">
        <Icon size={16} aria-hidden />
      </Box>
      <Box>
        <Text>{edible ? t("detail.edibleNote") : t("detail.inedibleNote")}</Text>
        <ToxicityEffect value={properties.toxicityEffectIt} />
      </Box>
    </HStack>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box as="section" bg="bg.panel" borderWidth="1px" borderColor="border" borderRadius="3xl" p={{ base: "5", md: "6" }}>
      <Heading as="h2" fontSize="xl" fontWeight="800" letterSpacing="-0.01em">
        {title}
      </Heading>
      {children}
    </Box>
  )
}

function Characteristics({ mushroom }: { mushroom: Mushroom }) {
  const { t } = useI18n()
  const valueLabel = useValueLabel()
  const { properties } = mushroom
  const groups = CHARACTERISTIC_GROUPS.map((g) => ({
    ...g,
    fields: g.fields.filter((f) => hasValue(properties[f.key])),
  })).filter((g) => g.fields.length > 0)

  return (
    <Section title={t("detail.characteristics")}>
      {groups.length === 0 ? (
        <Text color="fg.muted" mt="3">
          {t("detail.noCharacteristics")}
        </Text>
      ) : (
        <Stack gap="6" mt="4">
          {groups.map((g) => (
            <Box key={g.title}>
              <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.08em" color="moss.fg">
                {t(g.title)}
              </Text>
              <Box as="dl" mt="1">
                {g.fields.map((f) => (
                  <Grid
                    key={f.key}
                    templateColumns={{ base: "1fr", sm: "180px 1fr" }}
                    gap={{ base: "0", sm: "4" }}
                    py="2.5"
                    borderBottomWidth="1px"
                    borderColor="border"
                    _last={{ borderBottomWidth: "0" }}
                  >
                    <Text as="dt" color="fg.muted" fontSize="sm">
                      {t(f.label)}
                    </Text>
                    <Flex as="dd" justify="space-between" align="flex-start" gap="4">
                      <HStack gap="2">
                        {f.key === "sporePrint" && <SporePrintSwatch value={properties.sporePrint} w="3.5" h="3.5" />}
                        <Text fontWeight="600" _firstLetter={{ textTransform: "uppercase" }}>
                          {valueLabel(f.key, properties[f.key] as string)}
                        </Text>
                      </HStack>
                      <TraitDrawings property={f.key} value={properties[f.key] as string} />
                    </Flex>
                  </Grid>
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Section>
  )
}

/**
 * Section drawings of a characteristic, beside its value; a value like "convex or flat" gets one per alternative,
 * each captioned, while "ring and volva" is a single feature with its own drawing.
 */
function TraitDrawings({ property, value }: { property: Property; value: string }) {
  const valueLabel = useValueLabel()
  const shapes = value.split(" or ").filter((v) => hasTraitDrawing(property, v))
  if (shapes.length === 0) return null
  return (
    <Flex gap="3" wrap="wrap" justify="flex-end" flexShrink={0}>
      {shapes.map((shape) => (
        <Stack key={shape} as="figure" align="center" gap="1" color="fg">
          <Box bg="bg.subtle" borderRadius="xl" p="1.5">
            <TraitIcon property={property} value={shape} w="16" h="16" />
          </Box>
          {shapes.length > 1 && (
            <Text as="figcaption" fontSize="xs" color="fg.muted" _firstLetter={{ textTransform: "uppercase" }}>
              {valueLabel(property, shape)}
            </Text>
          )}
        </Stack>
      ))}
    </Flex>
  )
}

/** Common names in the UI language; hidden when the species has none in it. */
function CommonNames({ mushroom }: { mushroom: Mushroom }) {
  const { locale, t } = useI18n()
  const names = commonName(mushroom, locale)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  if (names.length === 0) return null
  return (
    <Section title={t("detail.commonNames")}>
      <Flex as="ul" listStyleType="none" wrap="wrap" gap="2" mt="4">
        {names.map((name) => (
          <Box as="li" key={name} bg="bg.subtle" borderRadius="full" px="3.5" py="1.5" fontWeight="600" _firstLetter={{ textTransform: "uppercase" }}>
            {name}
          </Box>
        ))}
      </Flex>
    </Section>
  )
}

/** Every photo of the species; hidden when the one in the hero is all there is. */
function Photos({ mushroom }: { mushroom: Mushroom }) {
  const { t } = useI18n()
  const { images } = mushroom.properties
  if (images.length < 2) return null
  return (
    <Section title={t("detail.photos")}>
      <PhotoGallery images={images} name={scientificName(mushroom)} />
    </Section>
  )
}

/** The ranks as a descending ladder, so the species reads as the end of its lineage. */
function Classification({ mushroom }: { mushroom: Mushroom }) {
  const { t } = useI18n()
  const ranks = RANKS.filter((r) => mushroom.taxonomy[r.key])
  const missingHigher = !mushroom.taxonomy.family

  return (
    <Section title={t("detail.classification")}>
      <Box as="ol" mt="4" listStyleType="none">
        {ranks.map((r, i) => {
          const last = i === ranks.length - 1
          const italic = r.key === "genus" || r.key === "species"
          return (
            <Flex as="li" key={r.key} gap="3" position="relative" pb={last ? "0" : "3"}>
              <Flex direction="column" align="center" flexShrink={0} w="3" pt="1.5">
                <Box w="2.5" h="2.5" borderRadius="full" bg={last ? "moss.solid" : "bg.panel"} borderWidth={last ? "0" : "2px"} borderColor="soil.300" />
                {!last && <Box flex="1" w="2px" bg="border" mt="1" mb="-2" />}
              </Flex>
              <Box minW="0">
                <Text fontSize="xs" color="fg.muted" lineHeight="1.2">
                  {t(r.label)}
                </Text>
                <Text fontWeight={last ? "800" : "600"} fontStyle={italic ? "italic" : undefined} overflowWrap="anywhere">
                  {r.key === "species" ? scientificName(mushroom) : mushroom.taxonomy[r.key]}
                </Text>
              </Box>
            </Flex>
          )
        })}
      </Box>
      {missingHigher && (
        <Text fontSize="sm" color="fg.muted" mt="4">
          {t("detail.higherRanksMissing")}
        </Text>
      )}
    </Section>
  )
}

function LearnMore({ mushroom }: { mushroom: Mushroom }) {
  const { locale, t } = useI18n()
  const name = scientificName(mushroom)
  // Special:Search jumps straight to the article when the title matches, and lists results otherwise.
  const href = `https://${locale}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`
  return (
    <Section title={t("detail.learnMore")}>
      <Link href={href} target="_blank" rel="noopener noreferrer" mt="3" color="moss.fg" fontWeight="600" display="inline-flex" gap="1.5">
        <Text as="span">{t("detail.wikipedia", { name })}</Text>
        <ExternalLink size={14} aria-hidden />
      </Link>
    </Section>
  )
}

/** Same genus first; a monotypic genus falls back to its family. */
function Related({ mushroom }: { mushroom: Mushroom }) {
  const { mushrooms } = useMushrooms()
  const { t } = useI18n()
  const { genus, family } = mushroom.taxonomy

  const related = useMemo(() => {
    const others = mushrooms.filter((m) => m.id !== mushroom.id)
    const sameGenus = others.filter((m) => m.taxonomy.genus === genus)
    if (sameGenus.length > 0) return { title: t("detail.relatedGenus", { taxon: genus }), list: sameGenus }
    const sameFamily = family ? others.filter((m) => m.taxonomy.family === family) : []
    if (sameFamily.length > 0) return { title: t("detail.relatedFamily", { taxon: family }), list: sameFamily }
  }, [mushrooms, mushroom.id, genus, family, t])

  if (!related) return null
  const shown = [...related.list].sort((a, b) => scientificName(a).localeCompare(scientificName(b))).slice(0, RELATED_LIMIT)
  const more = related.list.length - shown.length

  return (
    <Box as="section" mt={{ base: "10", md: "14" }}>
      <HStack justify="space-between" align="baseline" flexWrap="wrap" gap="2">
        <Heading as="h2" fontSize="2xl" fontWeight="800" letterSpacing="-0.02em">
          {related.title}
        </Heading>
        {more > 0 && (
          <Text color="fg.muted" fontSize="sm">
            {t("detail.relatedMore", { count: more })}
          </Text>
        )}
      </HStack>
      <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap="4" mt="4">
        {shown.map((m) => (
          <MushroomCard key={m.id} mushroom={m} />
        ))}
      </SimpleGrid>
    </Box>
  )
}
