import { Fragment, useState, type FormEvent } from "react"
import { Box, Button, Link as ChakraLink, Container, Field, Flex, Heading, Input, Stack, Text } from "@chakra-ui/react"
import { isAuthError } from "@supabase/supabase-js"
import { MailCheck } from "lucide-react"
import { Link, Navigate } from "react-router"
import { AUTH_REDIRECT_URL, supabase } from "../data/supabase"
import { useAuth } from "../hooks/useAuth"
import { useI18n } from "../i18n/I18nProvider"
import type { MessageKey } from "../i18n/locales/en"
import { usePageMeta } from "../hooks/usePageMeta"
import { loginMeta } from "../seo"

type Mode = "signIn" | "signUp"

/** Supabase Auth error codes with a message of our own; anything else shows the server's text. */
const ERRORS: Record<string, MessageKey> = {
  invalid_credentials: "login.error.invalidCredentials",
  email_not_confirmed: "login.error.emailNotConfirmed",
  user_already_exists: "login.error.userExists",
  email_exists: "login.error.userExists",
  weak_password: "login.error.weakPassword",
  over_request_rate_limit: "login.error.rateLimit",
  over_email_send_rate_limit: "login.error.rateLimit",
}

/** Shorter passwords are refused by Supabase Auth's default settings. */
const MIN_PASSWORD = 6

export function LoginPage() {
  const { t } = useI18n()
  usePageMeta(loginMeta(t))
  const { user } = useAuth()
  const [mode, setMode] = useState<Mode>("signIn")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState<"email" | "google">()
  const [error, setError] = useState<string>()
  const [confirmSent, setConfirmSent] = useState(false)

  if (user) return <Navigate to="/" replace />

  const describe = (err: unknown) => {
    const key = isAuthError(err) && err.code ? ERRORS[err.code] : undefined
    if (key) return t(key)
    return err instanceof Error && err.message ? err.message : t("login.error.generic")
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy("email")
    setError(undefined)
    try {
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // AuthProvider picks up the session and the redirect above takes over.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: AUTH_REDIRECT_URL },
        })
        if (error) throw error
        // With email confirmation on, there is no session until the link in the email is followed.
        if (!data.session) setConfirmSent(true)
      }
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(undefined)
    }
  }

  async function signInWithGoogle() {
    setBusy("google")
    setError(undefined)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: AUTH_REDIRECT_URL },
    })
    // On success the browser is already on its way to Google.
    if (error) {
      setError(describe(error))
      setBusy(undefined)
    }
  }

  function switchMode() {
    setMode(mode === "signIn" ? "signUp" : "signIn")
    setError(undefined)
  }

  if (confirmSent)
    return (
      <Container maxW="md" px="4" pt={{ base: "10", md: "16" }} textAlign="center">
        <Flex justify="center">
          <Box p="3" borderRadius="full" bg="moss.solid" color="moss.contrast">
            <MailCheck size={28} aria-hidden />
          </Box>
        </Flex>
        <Heading as="h1" mt="4" fontSize="3xl" fontWeight="800" letterSpacing="-0.02em">
          {t("login.confirm.title")}
        </Heading>
        <Text color="fg.muted" mt="3">
          {t("login.confirm.body", { email })}
        </Text>
        <Button
          mt="6"
          borderRadius="full"
          variant="outline"
          onClick={() => {
            setConfirmSent(false)
            setMode("signIn")
          }}
        >
          {t("login.confirm.back")}
        </Button>
      </Container>
    )

  return (
    <Container maxW="md" px="4" pt={{ base: "8", md: "14" }}>
      <Heading as="h1" fontSize={{ base: "3xl", md: "4xl" }} fontWeight="800" letterSpacing="-0.03em" lineHeight="1.1">
        {t(mode === "signIn" ? "login.title" : "login.signUpTitle")}
      </Heading>
      <Text color="fg.muted" mt="2">
        {t("login.subtitle")}
      </Text>

      <Button
        mt="8"
        w="full"
        size="lg"
        borderRadius="full"
        variant="outline"
        fontWeight="600"
        onClick={signInWithGoogle}
        loading={busy === "google"}
        disabled={busy === "email"}
      >
        <GoogleIcon />
        {t("login.google")}
      </Button>

      <Flex align="center" gap="3" my="6" color="fg.muted" fontSize="sm">
        <Box flex="1" h="1px" bg="border" />
        {t("login.or")}
        <Box flex="1" h="1px" bg="border" />
      </Flex>

      <form onSubmit={submit}>
        <Stack gap="4">
          <Field.Root required>
            <Field.Label>{t("login.email")}</Field.Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              borderRadius="xl"
              size="lg"
            />
          </Field.Root>
          <Field.Root required>
            <Field.Label>{t("login.password")}</Field.Label>
            <Input
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              minLength={mode === "signUp" ? MIN_PASSWORD : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              borderRadius="xl"
              size="lg"
            />
            {mode === "signUp" && <Field.HelperText>{t("login.passwordHint", { min: String(MIN_PASSWORD) })}</Field.HelperText>}
          </Field.Root>

          {error && (
            <Text role="alert" px="4" py="3" borderRadius="xl" bg="amanita.subtle" color="amanita.fg" fontSize="sm">
              {error}
            </Text>
          )}

          <Button
            type="submit"
            size="lg"
            borderRadius="full"
            colorPalette="moss"
            fontWeight="700"
            loading={busy === "email"}
            disabled={busy === "google"}
          >
            {t(mode === "signIn" ? "login.submit" : "login.signUpSubmit")}
          </Button>
        </Stack>
      </form>

      <Text mt="6" textAlign="center" fontSize="sm">
        {t(mode === "signIn" ? "login.noAccount" : "login.haveAccount")}{" "}
        <Button variant="plain" size="sm" p="0" h="auto" minW="0" fontWeight="700" textDecoration="underline" onClick={switchMode}>
          {t(mode === "signIn" ? "login.toSignUp" : "login.toSignIn")}
        </Button>
      </Text>

      <Text mt="6" textAlign="center" fontSize="xs" color="fg.muted">
        {t("login.agree")
          .split(/(\{terms\}|\{privacy\})/)
          .map((part, i) =>
            part === "{terms}" || part === "{privacy}" ? (
              <ChakraLink key={i} asChild color="fg" textDecoration="underline">
                <Link to={part === "{terms}" ? "/terms" : "/privacy"}>{t(part === "{terms}" ? "terms.title" : "privacy.title")}</Link>
              </ChakraLink>
            ) : (
              <Fragment key={i}>{part}</Fragment>
            ),
          )}
      </Text>
    </Container>
  )
}

/** Google's "G" mark, as its sign-in branding guidelines ask for. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
