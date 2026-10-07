import { useMemo, useState, type FormEvent } from "react"
import {
  Box,
  Button,
  Container,
  Field,
  Flex,
  Grid,
  Heading,
  IconButton,
  Input,
  Link as ChakraLink,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { Globe, MapPin, Trash2 } from "lucide-react"
import { Link } from "react-router"
import { commonName, scientificName, speciesPath, type Mushroom } from "../data/mushrooms"
import { MushroomIllustration } from "../components/MushroomIllustration"
import { MushroomPhoto } from "../components/MushroomPhoto"
import { ShareFindsDialog } from "../components/ShareFindsDialog"
import { SpeciesCombobox } from "../components/SpeciesCombobox"
import { currentPosition, loadSharingChoice, saveSharingChoice, shareFind } from "../data/sharedFinds"
import { useFinds, type Find } from "../hooks/useFinds"
import { useMushrooms } from "../hooks/useMushrooms"
import { useI18n } from "../i18n/I18nProvider"
import { usePageMeta } from "../hooks/usePageMeta"
import { findsMeta } from "../seo"

const today = () => new Date().toISOString().slice(0, 10)

export function FindsPage() {
  const { finds, addFind, updateFind, removeFind } = useFinds()
  const { mushrooms } = useMushrooms()
  const { locale, t } = useI18n()
  const [species, setSpecies] = useState<Mushroom>()
  const [speciesMissing, setSpeciesMissing] = useState(false)
  const [place, setPlace] = useState("")
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState("")
  // A find waiting for the answer to "share anonymously?", asked the first time one is logged.
  const [unasked, setUnasked] = useState<Omit<Find, "id">>()
  const [sharing, setSharing] = useState(loadSharingChoice)
  usePageMeta(findsMeta(t))

  // Finds remember the Latin name too, so they still resolve if the dataset changes ids.
  const lookup = useMemo(() => {
    const byId = new Map(mushrooms.map((m) => [m.id, m]))
    const byName = new Map(mushrooms.map((m) => [scientificName(m).toLowerCase(), m]))
    return (f: Find) =>
      (f.mushroomId !== undefined ? byId.get(f.mushroomId) : undefined) ?? byName.get(f.scientificName.toLowerCase())
  }, [mushrooms])

  // The find is saved right away; the position and the upload follow, since the browser may be
  // waiting on the user to answer its location prompt.
  const record = (find: Omit<Find, "id">, share: boolean) => {
    const id = addFind(find)
    if (!share) return
    void (async () => {
      const position = await currentPosition()
      if (position) updateFind(id, { position })
      try {
        await shareFind({ ...find, position })
        updateFind(id, { shared: true })
      } catch (error) {
        console.error("Could not share the find", error)
      }
    })()
  }

  const changeSharing = (share: boolean) => {
    saveSharingChoice(share)
    setSharing(share)
  }

  // Turned on from the switch: ask for the location now rather than on the next save.
  const toggleSharing = (share: boolean) => {
    changeSharing(share)
    if (share) void currentPosition()
  }

  const answerSharing = (share: boolean) => {
    changeSharing(share)
    if (unasked) record(unasked, share)
    setUnasked(undefined)
  }

  const dismissSharing = () => {
    if (unasked) record(unasked, false)
    setUnasked(undefined)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!species) {
      setSpeciesMissing(true)
      return
    }
    if (!place.trim()) return
    const find = {
      mushroomId: species.id,
      scientificName: scientificName(species),
      place: place.trim(),
      date,
      notes: notes.trim(),
    }
    if (sharing === undefined) setUnasked(find)
    else record(find, sharing)
    setPlace("")
    setNotes("")
    setDate(today())
  }

  return (
    <Container maxW="6xl" px={{ base: "4", md: "6" }} pt={{ base: "8", md: "12" }}>
      <Heading as="h1" fontSize={{ base: "4xl", md: "5xl" }} fontWeight="800" letterSpacing="-0.03em">
        {t("finds.title")}
      </Heading>
      <Text color="fg.muted" mt="2">
        {t("finds.intro")}
      </Text>

      <ShareFindsDialog open={unasked !== undefined} onAnswer={answerSharing} onDismiss={dismissSharing} />

      <Grid templateColumns={{ base: "1fr", lg: "380px 1fr" }} gap={{ base: "8", lg: "10" }} mt="6" alignItems="start">
        <Box as="form" onSubmit={submit} bg="bg.panel" borderWidth="1px" borderColor="border" borderRadius="3xl" p="5">
          <Heading as="h2" fontSize="xl" fontWeight="800" mb="4">
            {t("finds.formTitle")}
          </Heading>
          <Stack gap="4">
            <Field.Root required invalid={speciesMissing}>
              <Field.Label>
                {t("finds.species")} <Field.RequiredIndicator />
              </Field.Label>
              <SpeciesCombobox
                value={species?.id}
                onChange={(m) => {
                  setSpecies(m)
                  if (m) setSpeciesMissing(false)
                }}
              />
              <Field.ErrorText>{t("finds.speciesRequired")}</Field.ErrorText>
            </Field.Root>
            <Field.Root required>
              <Field.Label>
                {t("finds.place")} <Field.RequiredIndicator />
              </Field.Label>
              <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t("finds.placePlaceholder")} />
            </Field.Root>
            <Field.Root>
              <Field.Label>{t("finds.date")}</Field.Label>
              <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </Field.Root>
            <Field.Root>
              <Field.Label>{t("finds.notes")}</Field.Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("finds.notesPlaceholder")}
                rows={3}
              />
            </Field.Root>
            <Box>
              <Switch.Root
                checked={sharing === true}
                onCheckedChange={(e) => toggleSharing(e.checked)}
                colorPalette="moss"
              >
                <Switch.HiddenInput />
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.Label>{t("finds.share.toggle")}</Switch.Label>
              </Switch.Root>
              {(sharing || finds.some((f) => f.shared)) && (
                <Text fontSize="xs" color="fg.muted" mt="1">
                  {t("finds.share.kept")}
                </Text>
              )}
            </Box>
            <Button type="submit" size="lg" borderRadius="full" colorPalette="moss" fontWeight="700">
              {t("finds.save")}
            </Button>
          </Stack>
        </Box>

        <Box>
          {finds.length === 0 ? (
            <Flex direction="column" align="center" textAlign="center" py="10" px="6" borderRadius="3xl" bg="bg.subtle">
              <MushroomIllustration capColor="#B58962" stemColor="#E9D9C8" w="24" />
              <Text mt="4" fontWeight="700" fontSize="lg">
                {t("finds.emptyTitle")}
              </Text>
              <Text color="fg.muted" mt="1" maxW="xs">
                {t("finds.emptyBody")}
              </Text>
            </Flex>
          ) : (
            <Stack as="ul" gap="3" listStyleType="none">
              {finds.map((f) => {
                const m = lookup(f)
                const name = m ? scientificName(m) : f.scientificName || t("finds.unknownSpecies")
                const common = m ? commonName(m, locale) : ""
                return (
                  <Flex
                    as="li"
                    key={f.id}
                    gap="4"
                    align="center"
                    bg="bg.panel"
                    borderWidth="1px"
                    borderColor="border"
                    borderRadius="2xl"
                    p="3"
                  >
                    <MushroomPhoto
                      src={m?.properties.images[0]?.url ?? ""}
                      w="16"
                      h="16"
                      flexShrink={0}
                      borderRadius="xl"
                      illustrationWidth="10"
                    />
                    <Box flex="1" minW="0">
                      <Text fontWeight="700" fontStyle="italic">
                        {m ? (
                          <ChakraLink asChild>
                            <Link to={speciesPath(m)}>{name}</Link>
                          </ChakraLink>
                        ) : (
                          name
                        )}
                      </Text>
                      {common && (
                        <Text fontSize="sm" color="fg.muted" truncate>
                          {common}
                        </Text>
                      )}
                      <Flex align="center" gap="1" color="fg.muted" fontSize="sm">
                        <MapPin size={14} aria-hidden />
                        <Text truncate>{f.place}</Text>
                      </Flex>
                      <Text fontSize="xs" color="fg.muted">
                        {new Date(`${f.date}T00:00`).toLocaleDateString(locale, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                      {f.shared && (
                        <Flex align="center" gap="1" color="moss.fg" fontSize="xs">
                          <Globe size={12} aria-hidden />
                          <Text>{t("finds.shared")}</Text>
                        </Flex>
                      )}
                      {f.notes && (
                        <Text fontSize="sm" mt="1" lineClamp={2}>
                          {f.notes}
                        </Text>
                      )}
                    </Box>
                    <IconButton
                      aria-label={t("finds.delete", { species: name, place: f.place })}
                      variant="ghost"
                      size="sm"
                      color="fg.muted"
                      onClick={() => removeFind(f.id)}
                    >
                      <Trash2 />
                    </IconButton>
                  </Flex>
                )
              })}
            </Stack>
          )}
        </Box>
      </Grid>
    </Container>
  )
}
