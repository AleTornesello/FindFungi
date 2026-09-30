import { useState, type FormEvent } from "react"
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
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { MapPin, Trash2 } from "lucide-react"
import { SPECIES, type Species } from "../data/species"
import { MushroomIllustration } from "../components/MushroomIllustration"
import { useFinds } from "../hooks/useFinds"
import { useI18n } from "../i18n/I18nProvider"
import type { MessageKey } from "../i18n/locales/en"

const today = () => new Date().toISOString().slice(0, 10)

export function FindsPage() {
  const { finds, addFind, removeFind } = useFinds()
  const { locale, t } = useI18n()
  const speciesName = (s: Species) => t(`species.${s.id}` as MessageKey)
  const [speciesId, setSpeciesId] = useState(SPECIES[0].id)
  const [place, setPlace] = useState("")
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!place.trim()) return
    addFind({ speciesId, place: place.trim(), date, notes: notes.trim() })
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

      <Grid templateColumns={{ base: "1fr", lg: "380px 1fr" }} gap={{ base: "8", lg: "10" }} mt="6" alignItems="start">
        <Box as="form" onSubmit={submit} bg="bg.panel" borderWidth="1px" borderColor="border" borderRadius="3xl" p="5">
          <Heading as="h2" fontSize="xl" fontWeight="800" mb="4">
            {t("finds.formTitle")}
          </Heading>
          <Stack gap="4">
            <Field.Root>
              <Field.Label>{t("finds.species")}</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
                  {SPECIES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {speciesName(s)}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
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
                const s = SPECIES.find((sp) => sp.id === f.speciesId)
                const name = s ? speciesName(s) : t("finds.unknownSpecies")
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
                    <Flex
                      w="16"
                      h="16"
                      flexShrink={0}
                      align="center"
                      justify="center"
                      borderRadius="xl"
                      bg={s ? `color-mix(in srgb, ${s.capColor} 18%, transparent)` : "bg.subtle"}
                    >
                      {s && <MushroomIllustration capColor={s.capColor} stemColor={s.stemColor} spots={s.spots} w="12" />}
                    </Flex>
                    <Box flex="1" minW="0">
                      <Text fontWeight="700">{name}</Text>
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
