import { useEffect, useMemo, useRef, useState } from "react"
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  InputGroup,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react"
import { LayoutGrid, List, RefreshCw, Search, SlidersHorizontal, WifiOff, X } from "lucide-react"
import { commonName, scientificName } from "../data/mushrooms"
import { MushroomCard } from "../components/MushroomCard"
import { MushroomListItem } from "../components/MushroomListItem"
import { AdvancedFilterDialog } from "../components/AdvancedFilterDialog"
import {
  activeFilterCount,
  FILTER_FIELDS,
  filterValueLabel,
  matchesFilters,
  type AdvancedFilters,
} from "../data/advancedFilters"
import { OFFLINE_ERROR, useMushrooms, useValueLabel } from "../hooks/useMushrooms"
import { useI18n } from "../i18n/I18nProvider"
import { usePageMeta } from "../hooks/usePageMeta"
import { homeMeta } from "../seo"
import type { MessageKey } from "../i18n/locales/en"

type Filter = "all" | "edible" | "inedible" | "poisonous"

const FILTERS: { value: Filter; label: MessageKey }[] = [
  { value: "all", label: "explore.filter.all" },
  { value: "edible", label: "explore.filter.edible" },
  { value: "inedible", label: "explore.filter.inedible" },
  { value: "poisonous", label: "explore.filter.poisonous" },
]

const PAGE_SIZE = 48

interface SavedState {
  query: string
  filter: Filter
  advanced: AdvancedFilters
  shown: number
}

const STATE_KEY = "findfungi:explore"

function loadState(): SavedState {
  const fallback: SavedState = { query: "", filter: "all", advanced: {}, shown: PAGE_SIZE }
  try {
    const raw = sessionStorage.getItem(STATE_KEY)
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<SavedState>) } : fallback
  } catch {
    return fallback
  }
}

type View = "grid" | "list"

const VIEW_KEY = "findfungi.exploreView"

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"
  } catch {
    return "grid" // Storage blocked (private mode, disabled cookies).
  }
}

export function ExplorePage() {
  const { mushrooms, status } = useMushrooms()
  const { locale, t } = useI18n()
  const valueLabel = useValueLabel()
  const [saved] = useState(loadState)
  const [query, setQuery] = useState(saved.query)
  const [filter, setFilter] = useState<Filter>(saved.filter)
  const [advanced, setAdvanced] = useState<AdvancedFilters>(saved.advanced)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [shown, setShown] = useState(saved.shown)
  const [view, setView] = useState(loadView)
  const searchRef = useRef<HTMLInputElement>(null)
  usePageMeta(homeMeta(t))

  // Kept for the tab's lifetime so returning from a detail page restores the same results.
  useEffect(() => {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({ query, filter, advanced, shown } satisfies SavedState))
    } catch {
      // Storage can be unavailable (private mode); filters then just reset on return.
    }
  }, [query, filter, advanced, shown])

  // Unlike the filters, the layout is a lasting preference, so it outlives the tab.
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // Storage unavailable; the view falls back to the grid next time.
    }
  }, [view])

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    return mushrooms.filter(
      (m) =>
        (filter === "all" ||
          (filter === "poisonous" ? m.properties.poisonous : m.properties.edible === (filter === "edible"))) &&
        (!q ||
          scientificName(m).toLowerCase().includes(q) ||
          commonName(m, locale).toLowerCase().includes(q) ||
          m.taxonomy.family.toLowerCase().includes(q)),
    )
  }, [mushrooms, query, filter, locale])

  const results = useMemo(
    () =>
      searched
        .filter((m) => matchesFilters(m, advanced))
        .sort((a, b) => scientificName(a).localeCompare(scientificName(b))),
    [searched, advanced],
  )

  const advancedCount = activeFilterCount(advanced)
  const applyAdvanced = (next: AdvancedFilters) => {
    setAdvanced(next)
    setShown(PAGE_SIZE)
  }
  const removeAdvanced = (key: string, value: string) => {
    const { [key]: values = [], ...rest } = advanced
    const remaining = values.filter((v) => v !== value)
    applyAdvanced(remaining.length ? { ...rest, [key]: remaining } : rest)
  }

  return (
    <Container maxW="6xl" px={{ base: "4", md: "6" }} pt={{ base: "8", md: "12" }}>
      <Heading as="h1" fontSize={{ base: "4xl", md: "5xl" }} fontWeight="800" letterSpacing="-0.03em">
        {t("explore.title")}
      </Heading>
      <Text color="fg.muted" mt="2" maxW="xl">
        {t("explore.intro")}
      </Text>
      <SyncStatusBar />

      <InputGroup
        mt="6"
        startElement={<Search size={18} />}
        endElement={
          query && (
            <IconButton
              size="xs"
              variant="ghost"
              borderRadius="full"
              me="-2"
              aria-label={t("explore.clearSearch")}
              onClick={() => {
                setQuery("")
                setShown(PAGE_SIZE)
                searchRef.current?.focus()
              }}
            >
              <X />
            </IconButton>
          )
        }
      >
        <Input
          ref={searchRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShown(PAGE_SIZE)
          }}
          placeholder={t("explore.searchPlaceholder")}
          size="lg"
          bg="bg.panel"
          borderRadius="full"
          aria-label={t("explore.searchLabel")}
        />
      </InputGroup>

      <HStack mt="4" gap="2" justify="space-between" flexWrap="wrap">
        <HStack role="group" aria-label={t("explore.edibilityGroup")} gap="2" flexWrap="wrap">
          {FILTERS.map((f) => {
            const active = filter === f.value
            return (
              <Button
                key={f.value}
                size="sm"
                borderRadius="full"
                flexShrink={0}
                aria-pressed={active}
                onClick={() => {
                  setFilter(f.value)
                  setShown(PAGE_SIZE)
                }}
                bg={active ? "soil.900" : "bg.panel"}
                color={active ? "lichen.300" : "fg"}
                borderWidth="1px"
                borderColor={active ? "soil.900" : "border"}
                _hover={{ borderColor: "soil.500" }}
              >
                {t(f.label)}
              </Button>
            )
          })}
        </HStack>
        <HStack gap="2">
          <Button
            size="sm"
            borderRadius="full"
            variant="outline"
            bg="bg.panel"
            borderColor={advancedCount ? "soil.900" : "border"}
            _hover={{ borderColor: "soil.500" }}
            onClick={() => setDialogOpen(true)}
          >
            <SlidersHorizontal />
            {t("explore.filters")}
            {advancedCount > 0 && (
              <Badge bg="soil.900" color="lichen.300" borderRadius="full" px="2">
                {advancedCount}
              </Badge>
            )}
          </Button>
          <IconButton
            size="sm"
            borderRadius="full"
            variant="outline"
            bg="bg.panel"
            _hover={{ borderColor: "soil.500" }}
            aria-label={view === "grid" ? t("explore.viewList") : t("explore.viewGrid")}
            title={view === "grid" ? t("explore.viewList") : t("explore.viewGrid")}
            onClick={() => setView(view === "grid" ? "list" : "grid")}
          >
            {view === "grid" ? <List /> : <LayoutGrid />}
          </IconButton>
        </HStack>
      </HStack>

      {advancedCount > 0 && (
        <Flex mt="3" gap="2" wrap="wrap" align="center" aria-label={t("explore.activeFilters")}>
          {FILTER_FIELDS.flatMap((f) =>
            (advanced[f.key] ?? []).map((value) => (
              <Button
                key={`${f.key}:${value}`}
                size="xs"
                borderRadius="full"
                variant="subtle"
                aria-label={t("explore.removeFilter", { field: t(f.label), value: filterValueLabel(f, value, t, valueLabel) })}
                onClick={() => removeAdvanced(f.key, value)}
              >
                <Text as="span" color="fg.muted">
                  {t(f.label)}:
                </Text>
                {filterValueLabel(f, value, t, valueLabel)}
                <X />
              </Button>
            )),
          )}
          <Button size="xs" variant="plain" color="fg.muted" textDecoration="underline" onClick={() => applyAdvanced({})}>
            {t("explore.clearFilters")}
          </Button>
        </Flex>
      )}

      <AdvancedFilterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mushrooms={searched}
        filters={advanced}
        onApply={applyAdvanced}
      />

      {mushrooms.length === 0 ? (
        <EmptyGuide loading={status === "loading" || status === "syncing"} />
      ) : results.length > 0 ? (
        <>
          {view === "list" ? (
            <Stack gap="2" mt="6">
              {results.slice(0, shown).map((m) => (
                <MushroomListItem key={m.id} mushroom={m} />
              ))}
            </Stack>
          ) : (
            <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap="4" mt="6">
              {results.slice(0, shown).map((m) => (
                <MushroomCard key={m.id} mushroom={m} />
              ))}
            </SimpleGrid>
          )}
          <Flex direction="column" align="center" mt="6" gap="3">
            <Text fontSize="sm" color="fg.muted">
              {t("explore.showing", { shown: Math.min(shown, results.length), total: results.length })}
            </Text>
            {shown < results.length && (
              <Button variant="outline" borderRadius="full" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                {t("explore.showMore")}
              </Button>
            )}
          </Flex>
        </>
      ) : (
        <Box mt="10" textAlign="center" color="fg.muted">
          <Text fontWeight="600" color="fg">
            {query.trim() ? t("explore.noMatchQuery", { query: query.trim() }) : t("explore.noMatchFilters")}
          </Text>
          <Text mt="1">{t("explore.noMatchHint")}</Text>
        </Box>
      )}
    </Container>
  )
}

function ago(ms: number, locale: string, justNow: string) {
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const days = Math.round((ms - Date.now()) / 86_400_000)
  if (days !== 0) return relative.format(days, "day")
  const hours = Math.round((ms - Date.now()) / 3_600_000)
  return hours !== 0 ? relative.format(hours, "hour") : justNow
}

function SyncStatusBar() {
  const { mushrooms, syncedAt, status, error, sync } = useMushrooms()
  const { locale, t } = useI18n()
  const syncing = status === "syncing"

  return (
    <HStack mt="3" gap="2" fontSize="sm" color="fg.muted" flexWrap="wrap">
      {syncing ? (
        <Spinner size="xs" />
      ) : status === "error" ? (
        <WifiOff size={14} aria-hidden />
      ) : null}
      <Text>
        {syncing
          ? t("sync.updating")
          : syncedAt
            ? t("sync.summary", { count: mushrooms.length, when: ago(syncedAt, locale, t("sync.justNow")) })
            : t("sync.notDownloaded")}
        {status === "error" &&
          ` · ${t("sync.failed", { error: error === OFFLINE_ERROR ? t("sync.offline") : (error ?? "") })}`}
      </Text>
      <IconButton
        aria-label={t("sync.updateNow")}
        size="2xs"
        variant="ghost"
        color="fg.muted"
        disabled={syncing}
        onClick={() => void sync()}
      >
        <RefreshCw />
      </IconButton>
    </HStack>
  )
}

function EmptyGuide({ loading }: { loading: boolean }) {
  const { t } = useI18n()
  return (
    <Flex direction="column" align="center" textAlign="center" mt="8" py="10" px="6" borderRadius="3xl" bg="bg.subtle">
      {loading ? <Spinner size="lg" color="moss.500" /> : <WifiOff size={32} aria-hidden />}
      <Text mt="4" fontWeight="700" fontSize="lg">
        {loading ? t("sync.loadingTitle") : t("sync.missingTitle")}
      </Text>
      <Text color="fg.muted" mt="1" maxW="sm">
        {loading ? t("sync.loadingBody") : t("sync.missingBody")}
      </Text>
    </Flex>
  )
}
