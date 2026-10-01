import { Navigate, Route, Routes } from "react-router"
import { Layout } from "./components/Layout"
import { ExplorePage } from "./pages/ExplorePage"
import { FindsPage } from "./pages/FindsPage"
import { MushroomDetailPage } from "./pages/MushroomDetailPage"
import { NotFoundPage } from "./pages/NotFoundPage"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ExplorePage />} />
        <Route path="explore" element={<Navigate to="/" replace />} />
        <Route path="species/:id" element={<MushroomDetailPage />} />
        <Route path="finds" element={<FindsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
