import { Navigate, Route, Routes } from "react-router"
import { Layout } from "./components/Layout"
import { DisclaimerPage } from "./pages/DisclaimerPage"
import { ExplorePage } from "./pages/ExplorePage"
import { FindsPage } from "./pages/FindsPage"
import { LoginPage } from "./pages/LoginPage"
import { MushroomDetailPage } from "./pages/MushroomDetailPage"
import { NotFoundPage } from "./pages/NotFoundPage"
import { PrivacyPage } from "./pages/PrivacyPage"
import { TermsPage } from "./pages/TermsPage"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ExplorePage />} />
        <Route path="explore" element={<Navigate to="/" replace />} />
        <Route path="species/:id" element={<MushroomDetailPage />} />
        <Route path="finds" element={<FindsPage />} />
        <Route path="disclaimer" element={<DisclaimerPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
