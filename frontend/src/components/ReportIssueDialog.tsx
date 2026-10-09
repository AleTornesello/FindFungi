import { useId, useState, type FormEvent } from "react"
import {
  Box,
  Button,
  Dialog,
  Field,
  Flex,
  HStack,
  Input,
  Link,
  NativeSelect,
  Portal,
  RadioCard,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { Link as RouterLink } from "react-router"
import { CircleCheck, Flag } from "lucide-react"
import { scientificName, type Mushroom } from "../data/mushrooms"
import {
  MESSAGE_MAX,
  MESSAGE_MIN,
  REPORT_FIELDS,
  SOURCE_MAX,
  sendReport,
  type ReportError,
  type ReportField,
  type ReportKind,
} from "../data/reports"
import { useAuth } from "../hooks/useAuth"
import { useI18n } from "../i18n/I18nProvider"
import type { MessageKey } from "../i18n/locales/en"

/** Labels of the fields, reusing the ones the species page shows where there is one. */
const FIELD_LABELS: Record<ReportField, MessageKey> = {
  commonNameIt: "report.field.commonNameIt",
  commonNameEn: "report.field.commonNameEn",
  edibility: "report.field.edibility",
  toxicity: "detail.toxicityEffect",
  cap: "field.cap",
  hymenium: "field.hymenium",
  lamella: "field.lamella",
  stipe: "field.stipe",
  gleba: "field.gleba",
  sporePrint: "field.sporePrint",
  ecology: "field.ecology",
  conservationStatus: "field.conservationStatus",
  taxonomy: "detail.classification",
  photos: "detail.photos",
  other: "report.field.other",
}

const KINDS: ReportKind[] = ["missing", "wrong"]

interface Props {
  mushroom: Mushroom
  open: boolean
  onClose: () => void
}

/** Lets anyone report missing or wrong information on a species page, signed in or not. */
export function ReportIssueDialog({ mushroom, open, onClose }: Props) {
  return (
    // Unmounting on close resets the form for the next report.
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      size="md"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="3xl" mx="4">
            <ReportForm mushroom={mushroom} onClose={onClose} />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

function ReportForm({ mushroom, onClose }: Omit<Props, "open">) {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const formId = useId()
  const [kind, setKind] = useState<ReportKind | null>(null)
  const [field, setField] = useState<ReportField | "">("")
  const [message, setMessage] = useState("")
  const [source, setSource] = useState("")
  const [website, setWebsite] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<ReportError | null>(null)

  const name = scientificName(mushroom)
  const valid = kind !== null && message.trim().length >= MESSAGE_MIN

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (kind === null || !valid || sending) return
    setSending(true)
    setError(null)
    const result = await sendReport({
      mushroomId: mushroom.id,
      scientificName: name,
      kind,
      field: field || null,
      message: message.trim(),
      source: source.trim(),
      locale,
      website,
    })
    setSending(false)
    if (result) setError(result)
    else setSent(true)
  }

  if (sent) {
    return (
      <>
        <Dialog.Body pt="8">
          <Stack align="center" textAlign="center" gap="3">
            <Box color="moss.fg">
              <CircleCheck size={40} aria-hidden />
            </Box>
            <Dialog.Title fontFamily="heading" fontSize="xl" fontWeight="800">
              {t("report.sent.title")}
            </Dialog.Title>
            <Dialog.Description>{t("report.sent.body")}</Dialog.Description>
          </Stack>
        </Dialog.Body>
        <Dialog.Footer>
          <Button borderRadius="full" colorPalette="moss" w="full" onClick={onClose}>
            {t("report.close")}
          </Button>
        </Dialog.Footer>
      </>
    )
  }

  return (
    <>
      <Dialog.Header>
        <Flex align="center" gap="3">
          <Box flexShrink={0} p="2" borderRadius="full" bg="moss.solid" color="moss.contrast">
            <Flag size={22} aria-hidden />
          </Box>
          <Dialog.Title fontFamily="heading" fontSize="xl" fontWeight="800" letterSpacing="-0.02em">
            {t("report.title")}
          </Dialog.Title>
        </Flex>
      </Dialog.Header>

      <Dialog.Body>
        <Dialog.Description>{t("report.intro", { name })}</Dialog.Description>
        <Stack as="form" id={formId} onSubmit={submit} gap="4" mt="4" position="relative">
          <RadioCard.Root
            value={kind}
            onValueChange={(e) => e.value && setKind(e.value as ReportKind)}
            colorPalette="moss"
            size="sm"
          >
            <RadioCard.Label>{t("report.kind")}</RadioCard.Label>
            <HStack align="stretch">
              {KINDS.map((k) => (
                <RadioCard.Item key={k} value={k} flex="1">
                  <RadioCard.ItemHiddenInput />
                  <RadioCard.ItemControl>
                    <RadioCard.ItemText>{t(`report.kind.${k}`)}</RadioCard.ItemText>
                    <RadioCard.ItemIndicator />
                  </RadioCard.ItemControl>
                </RadioCard.Item>
              ))}
            </HStack>
          </RadioCard.Root>

          <Field.Root>
            <Field.Label>{t("report.field")}</Field.Label>
            <NativeSelect.Root size={{ base: "lg", md: "md" }}>
              <NativeSelect.Field value={field} onChange={(e) => setField(e.currentTarget.value as ReportField | "")}>
                <option value="">{t("report.field.whole")}</option>
                {REPORT_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {t(FIELD_LABELS[f])}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>

          <Field.Root required>
            <Field.Label>
              {t("report.message")} <Field.RequiredIndicator />
            </Field.Label>
            <Textarea
              size={{ base: "lg", md: "md" }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t(kind === "missing" ? "report.messagePlaceholder.missing" : "report.messagePlaceholder.wrong")}
              maxLength={MESSAGE_MAX}
              rows={4}
            />
            <Field.HelperText alignSelf="flex-end">
              {t("report.messageCount", { count: message.length, max: MESSAGE_MAX })}
            </Field.HelperText>
          </Field.Root>

          <Field.Root>
            <Field.Label>{t("report.source")}</Field.Label>
            <Input
              size={{ base: "lg", md: "md" }}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t("report.sourcePlaceholder")}
              maxLength={SOURCE_MAX}
              autoComplete="off"
            />
          </Field.Root>

          {/* Hidden from people and screen readers: only bots fill it in, and their reports are dropped. */}
          <Box position="absolute" left="-10000px" top="0" w="1px" h="1px" overflow="hidden" aria-hidden>
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </Box>

          <Text fontSize="sm" color="fg.muted">
            {user ? (
              t("report.signedIn", { email: user.email ?? "" })
            ) : (
              <>
                {t("report.anonymous")}{" "}
                <Link asChild color="moss.fg" fontWeight="600">
                  <RouterLink to="/login" onClick={onClose}>
                    {t("report.signIn")}
                  </RouterLink>
                </Link>
              </>
            )}
          </Text>

          {error && (
            <Text role="alert" fontSize="sm" color="amanita.fg">
              {t(`report.error.${error}`)}
            </Text>
          )}
        </Stack>
      </Dialog.Body>

      <Dialog.Footer flexDirection={{ base: "column-reverse", sm: "row" }} alignItems="stretch" gap="3">
        <Button borderRadius="full" variant="outline" onClick={onClose}>
          {t("report.cancel")}
        </Button>
        <Button
          type="submit"
          form={formId}
          borderRadius="full"
          colorPalette="moss"
          fontWeight="700"
          disabled={!valid}
          loading={sending}
        >
          {t("report.submit")}
        </Button>
      </Dialog.Footer>
    </>
  )
}
