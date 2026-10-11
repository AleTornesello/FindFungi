import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ChakraProvider } from "@chakra-ui/react"
import { BrowserRouter } from "react-router"
import { system } from "./theme"
import App from "./App"
import { AuthProvider } from "./hooks/useAuth"
import { MushroomsProvider } from "./hooks/useMushrooms"
import { I18nProvider } from "./i18n/I18nProvider"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <I18nProvider>
        <AuthProvider>
          <MushroomsProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <App />
            </BrowserRouter>
          </MushroomsProvider>
        </AuthProvider>
      </I18nProvider>
    </ChakraProvider>
  </StrictMode>,
)
