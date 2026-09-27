# Technical Preferences

## Engine & Language

- **Engine**: Phaser 3.90 (web)
- **Language**: TypeScript 5 (strict), React 18 for UI, Redux Toolkit for state
- **Rendering**: Phaser AUTO (WebGL, canvas fallback), pixel art, one room per canvas
- **Physics**: Phaser Arcade physics + custom tile-grid terrain (`climb/src/game/terrain/`)

## Input & Platform

- **Target Platforms**: Web (GitHub Pages), desktop and mobile browsers
- **Input Methods**: Keyboard + touch
- **Primary Input**: Keyboard
- **Gamepad Support**: None
- **Touch Support**: Partial (on-screen jump / d-pad buttons, landscape only)
- **Platform Notes**: The map editor is dev-only and desktop-only; the published build only has the game

## Naming Conventions

- **Classes**: PascalCase
- **Variables**: camelCase
- **Signals/Events**: bridge events in `EVT` (`area:action` strings), Redux actions via slices
- **Files**: PascalCase for classes and React components, camelCase for modules
- **Scenes/Prefabs**: Phaser scenes named in `SCENE` (`climb/src/game/bridge.ts`)
- **Constants**: UPPER_SNAKE_CASE

## Performance Budgets

- **Target Framerate**: 60 fps
- **Frame Budget**: 16.6 ms
- **Draw Calls**: [TO BE CONFIGURED]
- **Memory Ceiling**: [TO BE CONFIGURED]

## Testing

- **Framework**: Vitest (Phaser stubbed via `climb/src/test/phaser-stub.ts`), tests next to the code as `*.test.ts`
- **Minimum Coverage**: [TO BE CONFIGURED]
- **Required Tests**: Balance formulas, gameplay systems, networking (if applicable)

## Forbidden Patterns

- Hardcoding tile or entity characters in systems: ask the registries (`Tiles`, `Entities`, `Mechanics`) about capabilities instead
- Mechanics reaching into GameScene fields: go through `PlayContext`

## Allowed Libraries / Addons

- phaser, react, react-dom, @reduxjs/toolkit, react-redux, antd (editor only), motion, i18next, react-i18next

## Architecture Decisions Log

- [No ADRs yet — use /architecture-decision to create one]

## Engine Specialists

- **Primary**: none (no Phaser specialist agent; use general-purpose / gameplay-programmer)
- **Language/Code Specialist**: none
- **Shader Specialist**: none
- **UI Specialist**: ui-programmer
- **Additional Specialists**: none
- **Routing Notes**: Godot / Unity / Unreal specialists do not apply

### File Extension Routing

| File Extension / Type | Specialist to Spawn |
|-----------------------|---------------------|
| Game code (primary language) | gameplay-programmer |
| Shader / material files | n/a |
| UI / screen files | ui-programmer |
| Scene / prefab / level files | level-designer (map is `climb/src/map/world.json`, edited in the in-game editor) |
| Native extension / plugin files | n/a |
| General architecture review | lead-programmer |
