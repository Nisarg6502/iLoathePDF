import { useEffect, useState } from "react";

import { loadCustomRecipes, subscribeCustomRecipes } from "./customRecipes";
import type { Recipe } from "./recipes";

/** The user's saved recipes, kept in step with edits made anywhere in the app. */
export function useCustomRecipes(): Recipe[] {
  const [recipes, setRecipes] = useState<Recipe[]>(loadCustomRecipes);
  useEffect(() => subscribeCustomRecipes(() => setRecipes(loadCustomRecipes())), []);
  return recipes;
}
