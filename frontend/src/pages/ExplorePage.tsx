import { useMemo, useState } from "react"
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
  Text,
} from "@chakra-ui/react"
import { RefreshCw, Search, SlidersHorizontal, WifiOff, X } from "lucide-react"
import { scientificName } from "../data/mushrooms"
import { MushroomCard } from "../components/MushroomCard"
import { AdvancedFilterDialog } from "../components/AdvancedFilterDialog"
import { activeFilterCount, FILTER_FIELDS, matchesFilters, type AdvancedFilters } from "../data/advancedFilters"
import { useMushrooms } from "../hooks/useMushrooms"

type Filter = "all" | "edible" | "inedible"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "edible", label: "Edible" },
  { value: "inedible", label: "Not edible" },
]

const PAGE_SIZE = 48

export function ExplorePage() {
  const { mushrooms, status } = useMushrooms()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [advanced, setAdvanced] = useState<AdvancedFilters>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [shown, setShown] = useState(PAGE_SIZE)

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    return mushrooms.filter(
      (m) =>
        (filter === "all" || m.properties.edible === (filter === "edible")) &&
        (!q || scientificName(m).toLowerCase().includes(q) || m.taxonomy.family.toLowerCase().includes(q)),
    )
  }, [mushrooms, query, filter])

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
        Species
      </Heading>
      <Text color="fg.muted" mt="2" maxW="xl">
        Look up a species by its Latin name or family. The guide is saved on this device and works without signal.
      </Text>
      <SyncStatusBar />

      <InputGroup mt="6" startElement={<Search size={18} />}>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShown(PAGE_SIZE)
          }}
          placeholder="Search by Latin name or family"
          size="lg"
          bg="bg.panel"
          borderRadius="full"
          aria-label="Search species"
        />
      </InputGroup>

      <HStack mt="4" gap="2" justify="space-between" flexWrap="wrap">
        <HStack role="group" aria-label="Filter by edibility" gap="2">
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
                {f.label}
              </Button>
            )
          })}
        </HStack>
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
          Filters
          {advancedCount > 0 && (
            <Badge bg="soil.900" color="lichen.300" borderRadius="full" px="2">
              {advancedCount}
            </Badge>
          )}
        </Button>
      </HStack>

      {advancedCount > 0 && (
        <Flex mt="3" gap="2" wrap="wrap" align="center" aria-label="Active filters">
          {FILTER_FIELDS.flatMap((f) =>
            (advanced[f.key] ?? []).map((value) => (
              <Button
                key={`${f.key}:${value}`}
                size="xs"
                borderRadius="full"
                variant="subtle"
                aria-label={`Remove filter ${f.label}: ${value}`}
                onClick={() => removeAdvanced(f.key, value)}
              >
                <Text as="span" color="fg.muted">
                  {f.label}:
                </Text>
                {value}
                <X />
              </Button>
            )),
          )}
          <Button size="xs" variant="plain" color="fg.muted" textDecoration="underline" onClick={() => applyAdvanced({})}>
            Clear filters
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
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap="4" mt="6">
            {results.slice(0, shown).map((m) => (
              <MushroomCard key={m.id} mushroom={m} />
            ))}
          </SimpleGrid>
          <Flex direction="column" align="center" mt="6" gap="3">
            <Text fontSize="sm" color="fg.muted">
              Showing {Math.min(shown, results.length)} of {results.length}
            </Text>
            {shown < results.length && (
              <Button variant="outline" borderRadius="full" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                Show more
              </Button>
            )}
          </Flex>
        </>
      ) : (
        <Box mt="10" textAlign="center" color="fg.muted">
          <Text fontWeight="600" color="fg">
            {query.trim() ? `No species match “${query.trim()}”.` : "No species match these filters."}
          </Text>
          <Text mt="1">Try a shorter name or clear some filters.</Text>
        </Box>
      )}
    </Container>
  )
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

function ago(ms: number) {
  const days = Math.round((ms - Date.now()) / 86_400_000)
  if (days !== 0) return relative.format(days, "day")
  const hours = Math.round((ms - Date.now()) / 3_600_000)
  return hours !== 0 ? relative.format(hours, "hour") : "just now"
}

function SyncStatusBar() {
  const { mushrooms, syncedAt, status, error, sync } = useMushrooms()
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
          ? "Updating species guide…"
          : syncedAt
            ? `${mushrooms.length.toLocaleString()} species · updated ${ago(syncedAt)}`
            : "Species guide not downloaded yet"}
        {status === "error" && ` · couldn't update (${error})`}
      </Text>
      <IconButton
        aria-label="Update species guide now"
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
  return (
    <Flex direction="column" align="center" textAlign="center" mt="8" py="10" px="6" borderRadius="3xl" bg="bg.subtle">
      {loading ? <Spinner size="lg" color="moss.500" /> : <WifiOff size={32} aria-hidden />}
      <Text mt="4" fontWeight="700" fontSize="lg">
        {loading ? "Downloading the species guide" : "The species guide isn't on this device yet"}
      </Text>
      <Text color="fg.muted" mt="1" maxW="sm">
        {loading
          ? "This happens once. After that it works offline and refreshes itself every week."
          : "Connect to the internet once to download it. After that it works offline."}
      </Text>
    </Flex>
  )
}
