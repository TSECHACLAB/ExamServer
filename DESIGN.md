---
version: "alpha"
name: "ExamServer"
description: "A quiet Japanese study and exam interface for lecture-to-practice learning."
colors:
  primary: "#8A4F1D"
  primary-hover: "#6F3E16"
  canvas: "#F7F5F1"
  surface: "#FFFDFA"
  surface-muted: "#F0ECE5"
  text: "#1F1B16"
  text-muted: "#70665A"
  border: "#DED6C9"
  success: "#15803D"
  warning: "#B45309"
  danger: "#B91C1C"
typography:
  display:
    fontFamily: "Noto Serif JP"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: "1.25"
    letterSpacing: "0"
  body:
    fontFamily: "Noto Sans JP"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.8"
    letterSpacing: "0"
  label:
    fontFamily: "Noto Sans JP"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.45"
    letterSpacing: "0"
  mono:
    fontFamily: "Noto Sans Mono"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.4"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "44px"
  focus-ring:
    color: "{colors.primary}"
    width: "2px"
---

# Design System: ExamServer

## Overview

ExamServer is not a dashboard and not a marketing site. It is a study-to-practice service: read a concept, confirm it with questions, return to the exact place of confusion. The interface must reduce cognitive load by making the next action obvious and by hiding everything that is not needed for the current decision.

The visual model is a public-service learning tool: calm, structured, left-aligned, readable, and strongly accessible. A screen is successful when the user can answer these three questions within two seconds:

1. Where am I?
2. What is the next action?
3. What can I ignore for now?

## Research Basis

This document is grounded in:

- The local textbook at `C:\Users\phrx4\secretary\data_lake\books\design-textbook`, treated as OCR-assisted and manually verified where possible. The reliable principles extracted are proximity, alignment, repetition, contrast, and naming the design problem before fixing it.
- Digital Agency Design System accessibility guidance: accessibility must be considered through planning, design, development, content, and operation, with attention to contrast, font size, keyboard operation, focus indicators, target size, interaction states, motion, and content growth.
- Digital Agency Web Accessibility Guidebook: JIS X 8341-3:2016 remains common, but current practice must also address later issues such as smartphone accessibility and WCAG 2.2.
- Ministry of Internal Affairs and Communications public-site guidance: accessibility is an operational responsibility, not a one-time visual pass.
- WAIC/WCAG 2.2: target WCAG 2.2 AA where applicable. JIS X 8341-3:2016 is compatible with WCAG 2.0, so it is not enough by itself.
- GOV.UK Design System: start from small screens, use constrained readable layouts, treat patterns as user-task solutions, and keep main content in a readable primary column.
- Google DESIGN.md format: tokens give exact values; prose explains why and how to apply them.
- Anthropic frontend-design skill practice: choose a specific visual direction before writing UI. For ExamServer, that direction is not "pretty cards"; it is a quiet, single-focus study workspace where one current task dominates and secondary structure is disclosed only when needed.
- Community design-system practice from USWDS, Material, Carbon, Atlassian, and related design-system documentation: navigation depth, empty/loading/error states, spacing, and component state rules must be explicit so AI-generated changes do not invent new local grammar.

## Colors

Use a quiet reading canvas and one action accent. The lecture surface follows a modern documentation tone: warm off-white canvas, restrained borders, and a single brown action/link accent. The exam surface uses Digital Agency Design System semantic tokens. `modern-light` uses the official key-blue and neutral palette as the reference; the other four existing themes remap the same semantic roles without changing component structure. Success, warning, and danger colors are state colors only.

Do not use decorative gradients, glow, glassmorphism, purple-blue neon, or editorial decoration. Warm tones are allowed only as structural documentation tokens; they must not become atmosphere or ornament.

## Typography

Use Noto Serif JP for lecture page titles and h2/h3 headings only, creating the quieter documentation tone requested for the learning surface. Use Noto Sans JP for Japanese UI and prose, Geist Sans as Latin fallback, and Noto Sans Mono on exercise code, IDs, timers, and tabular values. Japanese text must be direct and task-oriented. Body prose is capped at roughly 65 characters per line. Labels are short; helper copy is used only when it changes a decision.

Do not move the exercise UI to serif typography. The serif layer belongs to lecture hierarchy, not answer controls, setup forms, or production-test surfaces.

Do not use centered body copy for app workflows. Strong left alignment is the default because it creates a clear reading edge and reduces scan cost.

## Layout

The lecture shell follows a documentation pattern: fixed top header, desktop left docs navigation, and mobile top `Navigation` disclosure. Exercise selection and setup use a constrained public-service layout. Active sessions use a dedicated question workspace with desktop review navigation, a compact mobile action region, and no global navigation.

Inside the page body, do not add a second navigation column unless the page is long-form reading. A learning entry page must have one dominant path, not a local map plus cards plus shortcuts.

Rules:

- Mobile first: one column, no horizontal scroll.
- Desktop content remains constrained. Main prose does not span the viewport.
- Use the GOV.UK-style idea of primary content plus secondary content only when the secondary content helps the current task.
- Related items are grouped by proximity; unrelated groups are separated by visibly larger spacing.
- Use a single strong alignment edge. Avoid mixing centered, left, and right alignment in the same work area.
- A page should expose at most 3 to 5 major visual groups above the fold.

Page-specific rules:

- `/learn`: one dominant action is `講義を読む`. The learning map is secondary and compact. Lesson summaries are not repeated in the map when the first lesson panel already explains the next item.
- `/learn` first viewport must not show both a current lesson and an expanded full curriculum. The default state is the next lesson plus one action; the curriculum is disclosed behind an explicit control.
- Lesson pages: desktop shows left chapter navigation and a right `このページ` outline. Mobile keeps both `Navigation` and `このページ` collapsed by default. The body order is breadcrumb, outline disclosure, article, next lesson, related practice.
- `/`: exercise choices and categories are vertical lists separated by dividers. Category cards and decorative grids are not used. Unavailable categories state the reason in text.
- Exam setup: use a constrained single-column form. Mode and question count are visible; optional domain and order controls use disclosure. One summary and one primary start action close the form.
- Exam session: answer controls, current question, answered count, flag state, and timer take priority over global navigation. Global navigation and theme switching are hidden. Desktop uses a question navigator plus one main reading column; mobile opens the navigator in a modal and reserves enough scroll space for the action region.
- Exam review: the last-question action opens a full review state. Submission only occurs after the user sees answered, unanswered, uncertain, and flagged counts and activates `採点する`.
- Drill feedback: correct/incorrect status, explanation, and source use one reading flow. Only the persistent primary action advances to the next question.
- Exam result: pass/fail text, score, passing threshold, and correct count precede per-question disclosures. Status never relies on color alone.
- `/lab`: a separately deployed practical-lab app is mounted at this same-origin path. Its main task stays visible while facts, choices, hints, and history are revealed only when the learner asks for them.

## Components

Cards are not a decoration style. Use a card only for a bounded decision or an isolated work area. Repeated lessons should usually be rows with dividers, not floating cards.

Buttons:

- Minimum height 44px.
- Radius 6px.
- Primary action is blue fill.
- Secondary action is border or text link.
- Active state translates or darkens subtly.
- Focus state is always visible.

Navigation:

- Active items must have both visual state and `aria-current` where appropriate.
- Global public navigation has `講義`, `演習`, and `実践ラボ`. `実践ラボ` uses a full document navigation because another deployment owns `/lab`.
- Admin is not part of the public navigation.
- During an exam session, global navigation, mobile tabs, and theme switchers are hidden.
- Desktop navigation should normally stay at two levels. Deeper structure belongs inside the current page as a compact list or in-page navigation.
- Prepared content, planned content, and external destinations must not look equally actionable.

Forms:

- Label above input.
- Helper text below only when needed.
- Errors are inline and specific.
- Multi-step forms must show one linear path.
- Exercise single-choice controls use the vendored DADS Radio implementation; multiple-choice and toggles use DADS Checkbox. Visual button substitutes are prohibited.

States:

- Define default, hover, focus, selected/current, disabled, loading, empty, and error states for every shared component.
- Empty states say what is missing, why it matters, and what action remains available.
- Error states are specific and non-blaming.
- Avoid disabled buttons when a clear enabled action plus inline guidance would teach the user what to fix.

## Practice DADS Source Contract

- Guideline baseline: Digital Agency Design System v2.17.0.
- React source baseline: `digital-go-jp/design-system-example-components-react` commit `22cda0df79f8f881953f11dca39e1c5a28619844`.
- Theme packages: `@digital-go-jp/design-tokens@2.0.1` and `@digital-go-jp/tailwind-theme-plugin@1.0.1`.
- Byte-identical upstream files live in `vendor/dads`. A generated `src/vendor/dads-runtime` shadow adds only a recorded TypeScript compatibility header because the pinned source predates React 19 ref/element typings; `verify:dads` proves both trees against their manifests. Next.js links, theme mapping, and product-specific composition belong to `src/components/dads` adapters.
- The exercise surface is scoped by `.practice-dads-surface`; lecture, lab, and admin surfaces do not inherit exercise token overrides.
- `modern-light`, `modern-dark`, `simple-light`, `simple-dark`, and `high-contrast` share component markup and differ only through semantic token values.
- Official primitives are used where available. App-specific composites such as question navigation and the exam workspace must be built from native landmarks and official primitives and documented as local composites.

## Accessibility

Target WCAG 2.2 AA and JIS X 8341-3:2016 AA-compatible behavior.

Mandatory checks:

- Text contrast meets AA.
- Focus indicators are visible and not color-only.
- Touch targets are at least 44px.
- Keyboard operation does not trap focus.
- Current location is programmatically exposed.
- Reading order matches visual order.
- Layout tolerates longer Japanese labels and content growth.
- Motion is nonessential and never the only cue.
- Single-choice answers use native radio semantics where possible; multi-choice answers use checkboxes.
- Question groups use `fieldset` and `legend` semantics where practical.
- Correct, incorrect, unanswered, flagged, selected, and current states are not represented by color alone.
- Sticky headers, footers, and mobile bottom controls must not hide focused content.

## Anti-Patterns

Never:

- Put multiple competing maps on one screen.
- Add a card because a section needs visual interest.
- Show all possible lessons before showing the next useful lesson.
- Use a secondary navigation column inside a page that already has the app sidebar unless it is a reading page.
- Hide the next action below explanatory text.
- Use centered layouts for workflow screens.
- Use visual-only active state.
- Let bottom tabs cover content.
- Create a page that requires the user to infer hierarchy from color alone.
- Add decorative badges, dots, counters, or progress ornaments that do not change a user decision.
- Mix admin, planned, external, and ready-to-start items in the same visual hierarchy.
- Use card grids for long educational lists.
- Add ranking, streak, dashboard, or gamification surfaces unless they directly improve lecture-to-practice movement.
