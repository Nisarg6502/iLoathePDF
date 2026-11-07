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

### Brainstorming session 2026-09-22 — deferred, blocked on infra

Started the design conversation right after Recipes shipped, per the user's
request. Decisions reached before pausing:

- **Model:** Ollama Cloud API — not a fully local/on-device model, not a
  bring-your-own-frontier-model setup. Explicit opt-in only, with a clear
  upfront warning that enabling AI features is a real exception to the
  app's "no phone home" stance (less private than the rest of the app,
  not a silent trade-off).
- **Local Ollama (fully private, zero network) support:** out of scope for
  v1 — cloud-only first, local support could be a later follow-up once the
  cloud path's UX is proven.
- **Shape:** "do-it-for-you" — user drops files and describes intent in a
  chat surface, the AI maps that to a tool/recipe and runs it directly via
  the existing `execute()`/`Engine` contracts, not a "guided hand-off" that
  merely opens the right tool for the user to run manually.

**Where it stalled:** the app has no backend server today (web is a static
site on GitHub Pages, desktop only talks to its local Python sidecar).
Calling Ollama Cloud needs an API key to live somewhere. The two options —
each user brings their own Ollama Cloud key (no backend needed, but real
setup friction), vs. the app hosts a proxy with a shared key (no user
friction, but a new backend to build/host/pay for, and a new privacy
surface since that proxy would see every prompt) — didn't have a clear
answer yet. **User's call: drop this for now — they plan to move the
website to Google Cloud later, which would make the "app-hosted proxy"
option viable.** Resume this brainstorming session once that infrastructure
move has happened; the API-key-handling question is exactly where to
pick the conversation back up (the two earlier decisions above — Ollama
Cloud, opt-in, do-it-for-you shape — still stand and don't need
re-litigating unless something about the infra move changes them).
