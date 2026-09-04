import { Routes, Route, Outlet } from "react-router-dom";
import { RequestStatusProvider } from "@/components/layout/RequestStatusContext";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Home } from "@/pages/Home";
import { ToolsIndex } from "@/pages/ToolsIndex";
import { ToolDetail } from "@/pages/ToolDetail";
import { HowItWorks } from "@/pages/HowItWorks";
import { Privacy } from "@/pages/Privacy";
import { Download } from "@/pages/Download";

function Layout() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </div>
  );
}

export default function App() {
  return (
    <RequestStatusProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="tools" element={<ToolsIndex />} />
          <Route path="tools/:slug" element={<ToolDetail />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="download" element={<Download />} />
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-6xl px-8 py-24 text-center">
                <p className="text-lg font-semibold">Page not found</p>
              </div>
            }
          />
        </Route>
      </Routes>
    </RequestStatusProvider>
  );
}
