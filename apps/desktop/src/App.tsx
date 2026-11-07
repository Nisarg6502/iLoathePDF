import { Suspense, lazy } from "react";
import { HashRouter, Link, Navigate, Route, Routes, useParams } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import Home from "./routes/Home";
import Settings from "./routes/Settings";
import ToolWorkspace from "./routes/ToolWorkspace";
import RecipeWorkspace from "./routes/RecipeWorkspace";
import RecipeBuilder from "./routes/RecipeBuilder";
import { useCustomRecipes } from "./lib/useCustomRecipes";
import { TOOLS } from "./lib/tools";
import { RECIPES } from "./lib/recipes";
import { MotionConfig } from "motion/react";

const PreviewLab = lazy(() => import("./routes/PreviewLab"));

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          {TOOLS.map((tool) => (
            <Route key={tool.id} path={tool.path} element={<ToolWorkspace tool={tool} />} />
          ))}
          <Route path="/r/new" element={<RecipeBuilder />} />
          <Route path="/r/:id/edit" element={<RecipeBuilder />} />
          <Route path="/r/:id" element={<RecipeRoute />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/t/:id" element={<UnknownTool />} />
          {/* Component workbench; dev builds only, never shipped. */}
          {import.meta.env.DEV ? (
            <Route
              path="/lab"
              element={
                <Suspense fallback={null}>
                  <PreviewLab />
                </Suspense>
              }
            />
          ) : null}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </HashRouter>
    </MotionConfig>
  );
}

/** Resolves /r/:id to a built-in or a saved custom recipe. */
function RecipeRoute() {
  const { id } = useParams();
  const custom = useCustomRecipes();
  const recipe = RECIPES.find((r) => r.id === id) ?? custom.find((r) => r.id === id);
  return recipe ? <RecipeWorkspace key={recipe.id} recipe={recipe} /> : <UnknownTool />;
}

function UnknownTool() {
  const { id } = useParams();
  return (
    <div className="mx-auto max-w-md px-8 py-24 text-center">
      <h1 className="text-lg font-semibold text-text">Nothing here called “{id}”</h1>
      <p className="mt-2 text-[14px] text-muted">
        It may have been renamed. Everything the app can do is on the home screen.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg"
      >
        Back to home
      </Link>
    </div>
  );
}
