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
import { SPECIES } from "../data/species"
import { MushroomIllustration } from "../components/MushroomIllustration"
import { useFinds } from "../hooks/useFinds"

const today = () => new Date().toISOString().slice(0, 10)

export function FindsPage() {
  const { finds, addFind, removeFind } = useFinds()
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
        My finds
      </Heading>
      <Text color="fg.muted" mt="2">
        Your finds are saved in this browser.
      </Text>

      <Grid templateColumns={{ base: "1fr", lg: "380px 1fr" }} gap={{ base: "8", lg: "10" }} mt="6" alignItems="start">
        <Box as="form" onSubmit={submit} bg="bg.panel" borderWidth="1px" borderColor="border" borderRadius="3xl" p="5">
          <Heading as="h2" fontSize="xl" fontWeight="800" mb="4">
            Log a find
          </Heading>
          <Stack gap="4">
            <Field.Root>
              <Field.Label>Species</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
                  {SPECIES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.commonName}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
            <Field.Root required>
              <Field.Label>
                Place <Field.RequiredIndicator />
              </Field.Label>
              <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Old beech wood, north path" />
            </Field.Root>
            <Field.Root>
              <Field.Label>Date</Field.Label>
              <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </Field.Root>
            <Field.Root>
              <Field.Label>Notes</Field.Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How many, what they grew on, smell…"
                rows={3}
              />
            </Field.Root>
            <Button type="submit" size="lg" borderRadius="full" colorPalette="moss" fontWeight="700">
              Save find
            </Button>
          </Stack>
        </Box>

        <Box>
          {finds.length === 0 ? (
            <Flex direction="column" align="center" textAlign="center" py="10" px="6" borderRadius="3xl" bg="bg.subtle">
              <MushroomIllustration capColor="#B58962" stemColor="#E9D9C8" w="24" />
              <Text mt="4" fontWeight="700" fontSize="lg">
                No finds yet
              </Text>
              <Text color="fg.muted" mt="1" maxW="xs">
                Fill in the form after your next walk. The place and date help you return next season.
              </Text>
            </Flex>
          ) : (
            <Stack as="ul" gap="3" listStyleType="none">
              {finds.map((f) => {
                const s = SPECIES.find((sp) => sp.id === f.speciesId)
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
                      <Text fontWeight="700">{s?.commonName ?? "Unknown species"}</Text>
                      <Flex align="center" gap="1" color="fg.muted" fontSize="sm">
                        <MapPin size={14} aria-hidden />
                        <Text truncate>{f.place}</Text>
                      </Flex>
                      <Text fontSize="xs" color="fg.muted">
                        {new Date(`${f.date}T00:00`).toLocaleDateString(undefined, {
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
                      aria-label={`Delete ${s?.commonName ?? "find"} at ${f.place}`}
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
