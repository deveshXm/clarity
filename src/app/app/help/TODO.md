# Docs Refactor To‑Do (Mintlify style)

- [x] Phase 1: Scaffold components and nav data
  - [x] Create `DocsHeader`, `DocsSidebar`, `DocsTOC`
  - [x] Create `Callout`, `CodeBlock`
  - [x] Create `nav.ts` structure
- [ ] Phase 2: Refactor `page.tsx` to semantic sections and integrate `Callout`/`CodeBlock`
  - [ ] Replace grid + inline nav with clean prose + anchors
  - [ ] Ensure stable IDs for h2/h3
- [ ] Phase 3: Extract shell to `layout.tsx` (3‑column with sticky sidebars)
  - [ ] Wire `DocsHeader`, `DocsSidebar`, `DocsTOC`
  - [ ] Remove background gradient on docs route
- [ ] Phase 4: Interactions polish
  - [ ] Scrollspy (IntersectionObserver) for Sidebar and TOC
  - [ ] Smooth scrolling + anchor copy
  - [ ] Code copy success microfeedback
- [ ] Phase 5: Responsive + visual polish
  - [ ] Mobile nav sheet
  - [ ] Spacing/contrast audit, subtle shadows and borders

Notes: No dark mode for docs; prioritize Mintlify look & feel.
