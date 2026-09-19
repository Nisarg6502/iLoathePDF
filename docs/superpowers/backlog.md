# Backlog — future ideas

Raw ideas captured for later brainstorming, not yet designed. Each one goes
through the normal `brainstorming` → `writing-plans` → implementation
pipeline when its turn comes — nothing here is a commitment to a specific
design, just a placeholder so the idea isn't lost.

## AI chatbot / natural-language front door

Recorded 2026-09-19, after shipping Recipes (curated multi-step tool
chains). The user's framing: "chaining tools method is a game changer" —
the next logical step is an AI layer on top of the tool/recipe surface,
along two possible shapes (not mutually exclusive, could ship in stages):

1. **Do-it-for-you chatbot.** User dumps files into a chat interface and
   says what they want done, in their own words (no need to know a tool's
   name or which recipe fits) — the assistant figures out which tool(s) or
   recipe apply and runs them.
2. **Guided hand-off.** User describes intent without files yet; the
   assistant opens the right tool(s) on screen and prompts the user to drop
   their files there, rather than trying to execute everything itself
   inside the chat.

Open question to explore at design time, per the user: more broadly, what
can an AI layer do to save users time, cut redundant steps, or lower the
friction of using these tools — not limited to the two shapes above.

**Constraints this app already established that any design here must
respect:** privacy-first / local-only (no phoning home — an AI layer that
requires a cloud model call would cut against the app's core selling
point, so a local/on-device model or a clearly-opt-in cloud path would need
its own explicit design discussion, not be assumed); the existing
tool/recipe contracts (desktop `execute()`, web `Engine`) should stay the
integration point, the same way Recipes reused them without touching any
op/engine interface.

**Sequencing:** explicitly next after whatever is currently in flight
finishes shipping (Recipes, as of this writing). Do not start designing
this until the current branch is merged.
