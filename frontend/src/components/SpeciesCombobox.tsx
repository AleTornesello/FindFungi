import { useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { Box, Combobox, createListCollection, Portal, Text } from "@chakra-ui/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { commonName, scientificName, type Mushroom } from "../data/mushrooms"
import { useMushrooms } from "../hooks/useMushrooms"
import { useI18n } from "../i18n/I18nProvider"
import { EdibilityBadge } from "./EdibilityBadge"

/** Rows have a fixed height, Latin name over common name, so the virtualizer never has to measure them. */
const ROW_HEIGHT = 52
/** Combobox.Content's padding, which offsets the rows inside the scrolling element. */
const CONTENT_PADDING = 4

/** Case and accent insensitive, so typing on a phone keyboard without accents still matches. */
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

/** Every name a species is known by, Latin first, in both languages so either finds it. */
const searchNames = (m: Mushroom) =>
  [scientificName(m), m.properties.commonNameIt ?? "", m.properties.commonNameEn ?? ""]
    .flatMap((names) => names.split(","))
    .map((name) => normalize(name.trim()))
    .filter(Boolean)

/**
 * Searchable species picker for the finds form. Names starting with the query come before
 * names that only contain it, then species are sorted by Latin name. The whole dataset is
 * listed, but only the rows in view are rendered.
 */
export function SpeciesCombobox({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (mushroom: Mushroom | undefined) => void
}) {
  const { mushrooms, status } = useMushrooms()
  const { locale, t } = useI18n()
  const [query, setQuery] = useState("")
  const contentRef = useRef<HTMLDivElement | null>(null)

  const indexed = useMemo(
    () =>
      mushrooms
        .map((m) => ({ mushroom: m, names: searchNames(m) }))
        .sort((a, b) => scientificName(a.mushroom).localeCompare(scientificName(b.mushroom))),
    [mushrooms],
  )

  const collection = useMemo(() => {
    const q = normalize(query.trim())
    const ranked = !q
      ? indexed
      : indexed
          .map((entry) => ({
            ...entry,
            rank: entry.names.some((name) => name.startsWith(q) || name.includes(` ${q}`))
              ? 0
              : entry.names.some((name) => name.includes(q))
                ? 1
                : 2,
          }))
          .filter((entry) => entry.rank < 2)
          .sort((a, b) => a.rank - b.rank)
    return createListCollection({
      items: ranked.map((entry) => entry.mushroom),
      itemToString: scientificName,
      itemToValue: (m) => String(m.id),
    })
  }, [indexed, query])

  const virtualizer = useVirtualizer({
    count: collection.size,
    getScrollElement: () => contentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    // Without it, keyboard navigation stops a row short of fully revealing the last one.
    scrollMargin: CONTENT_PADDING,
  })

  return (
    <Combobox.Root
      collection={collection}
      value={value === undefined ? [] : [String(value)]}
      onValueChange={(e) => onChange(e.items[0])}
      onInputValueChange={(e) => setQuery(e.inputValue)}
      openOnClick
      // Larger on phones, where the form is filled in with a thumb out in the woods.
      size={{ base: "lg", md: "md" }}
      // Keyboard navigation can highlight a row that isn't rendered yet; scroll it into existence first.
      scrollToIndexFn={({ index }) => {
        flushSync(() => virtualizer.scrollToIndex(index, { align: "auto" }))
      }}
    >
      <Combobox.Control>
        <Combobox.Input placeholder={t("finds.speciesPlaceholder")} />
        <Combobox.IndicatorGroup>
          <Combobox.ClearTrigger />
          <Combobox.Trigger onClick={() => setQuery("")} />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content ref={contentRef} p={`${CONTENT_PADDING}px`}>
            <Combobox.Empty>
              {mushrooms.length === 0 && status !== "error"
                ? t("finds.speciesLoading")
                : t("finds.noSpeciesMatch", { query: query.trim() })}
            </Combobox.Empty>
            <Box position="relative" w="full" flexShrink={0} style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((row) => {
                const m = collection.items[row.index]
                const common = commonName(m, locale)
                return (
                  <Combobox.Item
                    key={m.id}
                    item={m}
                    position="absolute"
                    top="0"
                    left="0"
                    w="full"
                    style={{ height: row.size, transform: `translateY(${row.start - CONTENT_PADDING}px)` }}
                  >
                    <Box flex="1" minW="0">
                      <Combobox.ItemText fontStyle="italic" truncate>
                        {scientificName(m)}
                      </Combobox.ItemText>
                      {common && (
                        <Text fontSize="xs" color="fg.muted" truncate>
                          {common}
                        </Text>
                      )}
                    </Box>
                    <EdibilityBadge properties={m.properties} size="xs" flexShrink={0} />
                    <Combobox.ItemIndicator />
                  </Combobox.Item>
                )
              })}
            </Box>
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  )
}
