import { Suspense, lazy } from "react";
import { Routes, Route, Outlet, useLocation } from "react-router-dom";
import { RequestStatusProvider } from "@/components/layout/RequestStatusContext";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Home } from "@/pages/Home";
import { ToolsIndex } from "@/pages/ToolsIndex";

// Everything below the landing pages loads on demand, so the first visit only
// downloads what the home page and tool list need.
const ToolDetail = lazy(() => import("@/pages/ToolDetail").then((m) => ({ default: m.ToolDetail })));
const RecipesIndex = lazy(() => import("@/pages/RecipesIndex").then((m) => ({ default: m.RecipesIndex })));
const RecipeDetail = lazy(() => import("@/pages/RecipeDetail").then((m) => ({ default: m.RecipeDetail })));
const HowItWorks = lazy(() => import("@/pages/HowItWorks").then((m) => ({ default: m.HowItWorks })));
const Privacy = lazy(() => import("@/pages/Privacy").then((m) => ({ default: m.Privacy })));
const Download = lazy(() => import("@/pages/Download").then((m) => ({ default: m.Download })));

function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-bg text-text">
      <SiteHeader />
      <div key={pathname} className="page-in">
        <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
          <Outlet />
        </Suspense>
      </div>
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
          <Route path="recipes" element={<RecipesIndex />} />
          <Route path="recipes/:slug" element={<RecipeDetail />} />
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
