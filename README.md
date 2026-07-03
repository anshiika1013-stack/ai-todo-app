# AI Todo App

A vanilla JavaScript to-do app that I built to strengthen my core JS concepts
(DOM, events, `localStorage`, `fetch`, async/await) and then extended with
AI-powered features using the Claude (Anthropic) API.

## Features

**Core todo**
- Add / complete / delete tasks
- Filter by All / Active / Completed
- "N items left" counter and Clear Completed
- Tasks persist across reloads via `localStorage`

**AI-powered (Claude)**
- **Natural-language input** — type "call mom tomorrow at 5pm" and it becomes a
  clean task with a real due date
- **Auto priority & tags** — each task gets a priority (high/medium/low) and a
  category (work, personal, health, …), shown as badges
- **Plan my day** — Claude suggests an order to tackle your open tasks

## How the AI works

The AI features can run two ways (toggle in **✨ AI settings**):

1. **Demo mode** (default) — the AI is simulated locally, so the features work
   instantly with no key or internet. Great for a quick look.
2. **Live mode** — real calls to the Claude API using
   [structured outputs](https://docs.claude.com/en/docs/build-with-claude/structured-outputs)
   so the model returns reliable JSON.

> ⚠️ **Live mode is for local practice only.** It calls the Claude API directly
> from the browser, which exposes the API key. Do **not** deploy this as-is — a
> production version should keep the key on a backend server and call that.

## Run it

No build step. Just open `01_localstorage/index.html` in a browser
(or use the VS Code "Live Server" extension).

## Tech

Plain HTML, CSS, and JavaScript — no frameworks, no build tools.
