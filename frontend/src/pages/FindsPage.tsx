import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
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
import { Cloud, CloudUpload, Globe, MapPin, Trash2 } from "lucide-react"
import { Link } from "react-router"
import { commonName, scientificName, speciesPath, type Mushroom } from "../data/mushrooms"
import { FindPhotoInput, useObjectUrl } from "../components/FindPhotoInput"
import { MushroomIllustration } from "../components/MushroomIllustration"
import { MushroomPhoto } from "../components/MushroomPhoto"
import { ShareFindsDialog } from "../components/ShareFindsDialog"
import { SpeciesCombobox } from "../components/SpeciesCombobox"
import { deletePhoto, loadPhoto, preparePhoto, savePhoto, uploadPhoto } from "../data/findPhotos"
import { currentPosition, loadSharingChoice, saveSharingChoice, shareFind } from "../data/sharedFinds"
import { useAuth } from "../hooks/useAuth"
import { useFinds, type Find } from "../hooks/useFinds"
import { useMushrooms } from "../hooks/useMushrooms"
import { useI18n } from "../i18n/I18nProvider"
import { usePageMeta } from "../hooks/usePageMeta"
import { findsMeta } from "../seo"

/** YYYY-MM-DD in the user's time zone. */
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const today = () => isoDate(new Date())

/** Chakra's lg breakpoint, where the form and the list sit side by side. */
const WIDE = "(min-width: 64rem)"

/** A find being logged, with its photo until it is stored. */
interface Draft {
  find: Omit<Find, "id">
  photo?: Blob
}

export function FindsPage() {
  const { finds, addFind, updateFind, removeFind } = useFinds()
  const { mushrooms } = useMushrooms()
  const { user, ready } = useAuth()
  const { locale, t } = useI18n()
  const [photo, setPhoto] = useState<Blob>()
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [species, setSpecies] = useState<Mushroom>()
  const [speciesMissing, setSpeciesMissing] = useState(false)
  const [place, setPlace] = useState("")
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState("")
  // A find waiting for the answer to "share anonymously?", asked the first time a signed-out user logs one.
  const [unasked, setUnasked] = useState<Draft>()
  const [sharing, setSharing] = useState(loadSharingChoice)
  // Bumped when the connection comes back, to retry the finds waiting to upload.
  const [online, setOnline] = useState(0)
  // Finds being located or uploaded, so they aren't uploaded twice.
  const busy = useRef(new Set<string>())
  const list = useRef<HTMLDivElement>(null)
  usePageMeta(findsMeta(t))

  const signedIn = ready && user !== null

  // Finds remember the Latin name too, so they still resolve if the dataset changes ids.
  const lookup = useMemo(() => {
    const byId = new Map(mushrooms.map((m) => [m.id, m]))
    const byName = new Map(mushrooms.map((m) => [scientificName(m).toLowerCase(), m]))
    return (f: Find) =>
      (f.mushroomId !== undefined ? byId.get(f.mushroomId) : undefined) ?? byName.get(f.scientificName.toLowerCase())
  }, [mushrooms])

  // A signed-in user's photo goes up first, so the find can point to it.
  const upload = useCallback(
    async (find: Find) => {
      if (busy.current.has(find.id)) return
      busy.current.add(find.id)
      try {
        let { photoPath } = find
        if (find.userId && find.hasPhoto && !photoPath) {
          const blob = await loadPhoto(find.id)
          if (blob) {
            photoPath = await uploadPhoto(find.userId, find.id, blob)
            updateFind(find.id, { photoPath })
          }
        }
        await shareFind({ ...find, photoPath }, { anonymous: !find.userId })
        updateFind(find.id, { shared: true, pending: undefined })
      } catch (error) {
        console.error("Could not upload the find", error)
      } finally {
        busy.current.delete(find.id)
      }
    },
    [updateFind],
  )

  useEffect(() => {
    const retry = () => setOnline((n) => n + 1)
    window.addEventListener("online", retry)
    return () => window.removeEventListener("online", retry)
  }, [])

  // Finds logged offline, or whose upload failed, go up on the next visit or when the connection
  // returns. A signed-in user's finds wait for that user: they are never sent with another session.
  useEffect(() => {
    if (!ready) return
    for (const f of finds) {
      if (f.pending && (!f.userId || f.userId === user?.id)) void upload(f)
    }
  }, [finds, ready, user, online, upload])

  // The find and its photo are saved right away; the position and the upload follow, since the
  // browser may be waiting on the user to answer its location prompt.
  const record = ({ find, photo }: Draft, share: boolean) => {
    const stored = { ...find, hasPhoto: photo ? true : undefined, pending: share || undefined }
    const id = addFind(stored)
    if (photo) savePhoto(id, photo).catch((error) => console.error("Could not keep the photo", error))
    if (!share) return
    busy.current.add(id)
    void (async () => {
      const position = await currentPosition()
      if (position) updateFind(id, { position })
      busy.current.delete(id)
      await upload({ ...stored, id, position })
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

  const pickPhoto = async (file: File) => {
    setPhotoBusy(true)
    setPhotoFailed(false)
    // Out in the woods, the position is worth asking for while the rest of the form is filled in.
    if (signedIn || sharing) void currentPosition()
    try {
      setPhoto(await preparePhoto(file))
      // A photo from the gallery may be from an earlier walk: date the find when it was taken.
      const taken = isoDate(new Date(file.lastModified))
      if (taken <= today()) setDate(taken)
    } catch (error) {
      console.error("Could not read the photo", error)
      setPhotoFailed(true)
    } finally {
      setPhotoBusy(false)
    }
  }

  const removePhoto = () => {
    setPhoto(undefined)
    setDate(today())
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!species) {
      setSpeciesMissing(true)
      return
    }
    if (!place.trim()) return
    const draft = {
      find: {
        mushroomId: species.id,
        scientificName: scientificName(species),
        place: place.trim(),
        date,
        notes: notes.trim(),
        userId: signedIn ? user.id : undefined,
      },
      photo,
    }
    // Signed-in users' finds are always saved to their account; others choose whether to share.
    if (signedIn) record(draft, true)
    else if (sharing === undefined) setUnasked(draft)
    else record(draft, sharing)
    setPhoto(undefined)
    setPhotoFailed(false)
    setPlace("")
    setNotes("")
    setDate(today())
    // On a phone the list is below the form: show the new find at its top.
    if (!window.matchMedia(WIDE).matches) list.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const remove = (id: string) => {
    removeFind(id)
    void deletePhoto(id)
  }

  return (
    <Container maxW="6xl" px={{ base: "4", md: "6" }} pt={{ base: "6", md: "12" }}>
      <Heading as="h1" fontSize={{ base: "3xl", md: "5xl" }} fontWeight="800" letterSpacing="-0.03em">
        {t("finds.title")}
      </Heading>
      <Text color="fg.muted" mt="2">
        {signedIn ? t("finds.introSignedIn") : t("finds.intro")}
      </Text>

      <ShareFindsDialog open={unasked !== undefined} onAnswer={answerSharing} onDismiss={dismissSharing} />

      <Grid templateColumns={{ base: "1fr", lg: "380px 1fr" }} gap={{ base: "8", lg: "10" }} mt="6" alignItems="start">
        <Box
          as="form"
          onSubmit={submit}
          bg="bg.panel"
          borderWidth="1px"
          borderColor="border"
          borderRadius="3xl"
          p={{ base: "4", md: "5" }}
        >
          <Heading as="h2" fontSize="xl" fontWeight="800" mb="4">
            {t("finds.formTitle")}
          </Heading>
          <Stack gap="4">
            <FindPhotoInput
              photo={photo}
              busy={photoBusy}
              failed={photoFailed}
              onPick={(file) => void pickPhoto(file)}
              onRemove={removePhoto}
            />
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
              <Input
                size={{ base: "lg", md: "md" }}
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder={t("finds.placePlaceholder")}
                autoComplete="off"
                enterKeyHint="next"
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>{t("finds.date")}</Field.Label>
              <Input
                size={{ base: "lg", md: "md" }}
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>{t("finds.notes")}</Field.Label>
              <Textarea
                size={{ base: "lg", md: "md" }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("finds.notesPlaceholder")}
                rows={3}
              />
            </Field.Root>
            {signedIn ? (
              <Flex gap="2" color="fg.muted" fontSize="xs">
                <Cloud size={14} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                <Text>{t("finds.account.note")}</Text>
              </Flex>
            ) : (
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
                {(sharing || finds.some((f) => f.shared && !f.userId)) && (
                  <Text fontSize="xs" color="fg.muted" mt="1">
                    {t("finds.share.kept")}
                  </Text>
                )}
              </Box>
            )}
            <Button
              type="submit"
              size="lg"
              borderRadius="full"
              colorPalette="moss"
              fontWeight="700"
              loading={photoBusy}
            >
              {t("finds.save")}
            </Button>
          </Stack>
        </Box>

        {/* Clear of the sticky header when scrolled to after saving. */}
        <Box ref={list} minW="0" scrollMarginTop="20">
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
                    <FindThumbnail find={f} mushroom={m} />
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
                      <FindStatus find={f} />
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
                      onClick={() => remove(f.id)}
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

/** The photo of the find if it has one in this browser, else the species' first photo. */
function FindThumbnail({ find, mushroom }: { find: Find; mushroom: Mushroom | undefined }) {
  const [photo, setPhoto] = useState<Blob>()
  useEffect(() => {
    if (!find.hasPhoto) return
    let current = true
    void loadPhoto(find.id).then((blob) => current && setPhoto(blob))
    return () => {
      current = false
    }
  }, [find.id, find.hasPhoto])
  const url = useObjectUrl(photo)
  const src = url ?? mushroom?.properties.images[0]?.url ?? ""
  // Keyed by the source, so the find's photo still shows if the species photo failed to load offline.
  return <MushroomPhoto key={src} src={src} w="16" h="16" flexShrink={0} borderRadius="xl" illustrationWidth="10" />
}

function FindStatus({ find }: { find: Find }) {
  const { t } = useI18n()
  if (!find.pending && !find.shared) return null
  const Icon = find.pending ? CloudUpload : find.userId ? Cloud : Globe
  const label = find.pending ? "finds.pending" : find.userId ? "finds.savedToAccount" : "finds.shared"
  return (
    <Flex align="center" gap="1" color={find.pending ? "fg.muted" : "moss.fg"} fontSize="xs">
      <Icon size={12} aria-hidden />
      <Text>{t(label)}</Text>
    </Flex>
  )
}
