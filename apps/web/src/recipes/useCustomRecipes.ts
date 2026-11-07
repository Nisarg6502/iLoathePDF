import { useEffect, useState } from "react";
import type { RecipeConfig } from "./registry";
import { loadCustomRecipes, subscribeCustomRecipes } from "./customRecipes";

/** The user's saved recipes, kept in step with edits made anywhere in the app. */
export function useCustomRecipes(): RecipeConfig[] {
  const [recipes, setRecipes] = useState<RecipeConfig[]>(loadCustomRecipes);
  useEffect(() => subscribeCustomRecipes(() => setRecipes(loadCustomRecipes())), []);
  return recipes;
}
