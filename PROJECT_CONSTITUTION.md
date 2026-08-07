# Project Constitution

## Product Thesis

- What this project is: ExamServer is a study, exam practice, and authorized practical-lab entry hub for IT qualifications, computer fundamentals, and security foundations.
- What this project is not: It is not a generic dashboard, ranking app, CTF hosting platform, or visual showcase.
- The core value users should feel: "I know where to learn, where to practice, and what to do next."
- The main behavior this product should create or change: users move between concise lessons and focused practice without losing their place.

## Core Mechanism

- The mechanism that makes the product work: concept learning and exam practice share one navigation grammar, so the user can move from lecture to drill and back with low mental overhead.
- The smallest proof that this mechanism is real: lecture pages behave like documentation with a fixed header, collapsible navigation, and a narrow reading column; exercise pages use one Digital Agency Design System interaction grammar from selection through results; during exams, answer controls take priority and global navigation is removed.
- The most likely way the mechanism fails: each screen invents its own cards, headers, and links, forcing the user to relearn navigation.

## User Reality

- Primary user: a Japanese beginner-to-intermediate learner preparing for IT exams and security fundamentals.
- What they are trying to decide or accomplish: choose a lesson, choose an exam category, start a practice session, answer questions, review results.
- What they should not have to think about: where navigation moved, whether a card is a link, how to return to the map, or what the next action is.
- Repeated actions: open lecture, return to map, choose category, adjust exam settings, answer, flag, move next, review.
- High-risk mistakes: starting the wrong mode, losing current question, confusing planned content with ready content, treating CTF links as internal lessons.

## Design Language

- Information density: balanced. Show enough context for orientation, but keep one primary action per view.
- Primary layout grammar: lecture pages use docs navigation on desktop and top disclosures on mobile; exercise selection and setup use a constrained single-column public-service form, while active sessions use a question workspace with desktop review navigation and a compact mobile action region.
- Primary interaction grammar: selected state, current state, next action, and safe back path are always visible.
- Visual tone: calm, instructional, restrained. Lecture pages use a modern documentation palette; exercise pages use Digital Agency Design System tokens with one key color and semantic status colors.
- Allowed components: side navigation, bottom tabs, native form controls, compact lists, disclosure, notification banners, modal dialogs for consequential confirmation, and inline callouts.
- Components/patterns to avoid: decorative dashboards, nested cards, large marketing heroes, ranking/progress gamification, excessive badges.
- Typography/spacing rules: lecture titles and headings may use Noto Serif JP for a quiet documentation tone; Japanese prose and UI use Noto Sans JP; exercise code/numbers use Noto Sans Mono; prose keeps a readable width, 8px max radius, touch targets of at least 44px, and no horizontal mobile overflow.

## Architecture Grammar

- Source of truth: exam data in `data/exams`, category metadata in `data/categories.json`, learning map in `data/learning-map.json`, UI grammar in `DESIGN.md`.
- Core domain objects: category, question, scenario, answer state, learning node, lesson, practical-lab entry.
- State model: validated exam configuration is established on the server; versioned exam runtime and completed feedback stay in session storage; idempotent progress stays in local storage. Learning navigation is derived from static data. Practical-lab target state remains with the Debian/Kali lab, while a separate lab service relays only its sanitized projection.
- Naming rules: user-facing labels are Japanese and task-based; code names describe domain purpose, not visual style.
- Boundaries between modules: learning navigation belongs to learning components; public shell owns global navigation; exam session owns answer controls. External rewrites delegate `/lab` and `/api/lab` to the isolated lab deployment; ExamServer never owns raw commands, flags, credentials, or target runtime.
- Things that must not be duplicated: global public navigation, learning tree rendering rules, answer normalization, answered-state rules, category grouping rules, DADS primitive source, or session configuration parsing.

## Non-Goals

- Do not build: hosted VM labs, CTF runtime inside ExamServer, social ranking, badges, generic analytics dashboard, paid-product landing page.
- Do not optimize for: novelty, visual spectacle, fake engagement, number-heavy dashboards.
- Do not imitate: AI SaaS landing pages, gamified study apps, admin templates, or the old local brutalist redesign branch.

## Decision Rules

Before adding anything, answer:

- Does this strengthen lecture-to-practice movement?
- Does this reduce or increase user decision load?
- Does this reuse the existing design and architecture grammar?
- Can this be removed, merged, renamed, or simplified instead?
- What future improvement becomes easier because of this?

## Improvement Loop

Every improvement must classify itself as one or more of:

- remove
- merge
- rename
- simplify state
- clarify hierarchy
- validate mechanism
- add capability

If the change is only "add capability", justify why the system should grow.
