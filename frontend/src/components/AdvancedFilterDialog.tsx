import { useMemo, useState } from "react"
import { Box, Button, CloseButton, Dialog, Flex, Heading, Portal, Stack, Text } from "@chakra-ui/react"
import type { Mushroom } from "../data/mushrooms"
import { activeFilterCount, FILTER_FIELDS, matchesFilters, type AdvancedFilters } from "../data/advancedFilters"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Species already narrowed by the page's search and edibility filter; option counts come from these. */
  mushrooms: Mushroom[]
  filters: AdvancedFilters
  onApply: (filters: AdvancedFilters) => void
}

const GROUPS = ["Taxonomy", "Characteristics"] as const

export function AdvancedFilterDialog({ open, onOpenChange, mushrooms, filters, onApply }: Props) {
  // Edits stay local until applied, so closing the dialog discards them.
  const [draft, setDraft] = useState(filters)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setDraft(filters)
  }

  // Counts for each field ignore that field's own selection, so picking one option
  // doesn't hide its siblings; options no species could match are left out.
  const options = useMemo(() => {
    if (!open) return {}
    const byField: Record<string, [string, number][]> = {}
    for (const f of FILTER_FIELDS) {
      const counts = new Map<string, number>()
      for (const m of mushrooms) {
        if (!matchesFilters(m, draft, f.key)) continue
        for (const v of new Set(f.values(m))) counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      for (const v of draft[f.key] ?? []) if (!counts.has(v)) counts.set(v, 0)
      byField[f.key] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    }
    return byField
  }, [open, mushrooms, draft])

  const matching = useMemo(
    () => (open ? mushrooms.filter((m) => matchesFilters(m, draft)).length : 0),
    [open, mushrooms, draft],
  )

  const toggle = (key: string, value: string) =>
    setDraft((d) => {
      const current = d[key] ?? []
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
      const { [key]: _, ...rest } = d
      return next.length ? { ...rest, [key]: next } : rest
    })

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      size={{ base: "full", md: "lg" }}
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius={{ base: "0", md: "3xl" }}>
            <Dialog.Header>
              <Dialog.Title fontFamily="heading" fontSize="2xl" fontWeight="800" letterSpacing="-0.02em">
                Filters
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>

            <Dialog.Body>
              <Stack gap="8">
                {GROUPS.map((group) => (
                  <Box key={group} as="section">
                    <Heading as="h3" fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color="fg.muted">
                      {group}
                    </Heading>
                    <Stack gap="5" mt="3">
                      {FILTER_FIELDS.filter((f) => f.group === group).map((f) => {
                        const fieldOptions = options[f.key] ?? []
                        if (fieldOptions.length === 0) return null
                        const selected = draft[f.key] ?? []
                        return (
                          <Box key={f.key} role="group" aria-label={f.label}>
                            <Text fontWeight="700" fontSize="sm" mb="2">
                              {f.label}
                            </Text>
                            <Flex gap="2" wrap="wrap">
                              {fieldOptions.map(([value, count]) => (
                                <OptionChip
                                  key={value}
                                  label={value}
                                  count={count}
                                  active={selected.includes(value)}
                                  onClick={() => toggle(f.key, value)}
                                />
                              ))}
                            </Flex>
                          </Box>
                        )
                      })}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Dialog.Body>

            <Dialog.Footer justifyContent="space-between" borderTopWidth="1px" borderColor="border">
              <Button variant="ghost" disabled={activeFilterCount(draft) === 0} onClick={() => setDraft({})}>
                Clear all
              </Button>
              <Button
                borderRadius="full"
                bg="soil.900"
                color="lichen.300"
                _hover={{ bg: "soil.800" }}
                onClick={() => {
                  onApply(draft)
                  onOpenChange(false)
                }}
              >
                Show {matching.toLocaleString()} species
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

function OptionChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      size="xs"
      borderRadius="full"
      aria-pressed={active}
      onClick={onClick}
      bg={active ? "soil.900" : "bg.panel"}
      color={active ? "lichen.300" : "fg"}
      borderWidth="1px"
      borderColor={active ? "soil.900" : "border"}
      _hover={{ borderColor: "soil.500" }}
    >
      {label}
      <Text as="span" opacity={0.6} fontWeight="500">
        {count}
      </Text>
    </Button>
  )
}
