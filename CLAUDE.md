# Claude Code Game Studios -- Game Studio Agent Architecture

Indie game development managed through 49 coordinated Claude Code subagents.
Each agent owns a specific domain, enforcing separation of concerns and quality.

## Technology Stack

- **Engine**: Phaser 3.90 (web, Arcade physics), game lives in `climb/`
- **Language**: TypeScript 5 + React 18 (UI) + Redux Toolkit (state)
- **Version Control**: Git with trunk-based development
- **Build System**: Vite 6 (`npm run build` in `climb/`), Vitest for tests, ESLint for lint
- **Asset Pipeline**: PNG / MP3 in `climb/src/asset/` (placeholder art from `npm run gen-art`), manifest in `climb/src/asset/index.ts`

> **Note**: The Godot / Unity / Unreal specialist agents and the files under
> `docs/engine-reference/` do not apply to this project. See `climb/README.md`
> for architecture, registries and mechanics.

## Project Structure

@.claude/docs/directory-structure.md

## Technical Preferences

@.claude/docs/technical-preferences.md

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**
Every task follows: **Question -> Options -> Decision -> Draft -> Approval**

- Agents MUST ask "May I write this to [filepath]?" before using Write/Edit tools
- Agents MUST show drafts or summaries before requesting approval
- Multi-file changes require explicit approval for the full changeset
- No commits without user instruction

See `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` for full protocol and examples.

> **First session?** If the project has no engine configured and no game concept,
> run `/start` to begin the guided onboarding flow.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

@.claude/docs/context-management.md
