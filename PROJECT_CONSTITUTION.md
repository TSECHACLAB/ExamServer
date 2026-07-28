# Project Constitution

## Product Thesis

- What this project is: ExamServer is a study, exam practice, and authorized practical-lab entry hub for IT qualifications, computer fundamentals, and security foundations.
- What this project is not: It is not a generic dashboard, ranking app, CTF hosting platform, or visual showcase.
- The core value users should feel: "I know where to learn, where to practice, and what to do next."
- The main behavior this product should create or change: users move between concise lessons and focused practice without losing their place.

## Core Mechanism

- The mechanism that makes the product work: concept learning and exam practice share one navigation grammar, so the user can move from lecture to drill and back with low mental overhead.
- The smallest proof that this mechanism is real: lecture pages behave like documentation with a fixed header, collapsible navigation, and a narrow reading column; exercise pages keep their existing practice flow; during exams, answer controls take priority and global navigation is removed.
- The most likely way the mechanism fails: each screen invents its own cards, headers, and links, forcing the user to relearn navigation.

## User Reality

- Primary user: a Japanese beginner-to-intermediate learner preparing for IT exams and security fundamentals.
- What they are trying to decide or accomplish: choose a lesson, choose an exam category, start a practice session, answer questions, review results.
- What they should not have to think about: where navigation moved, whether a card is a link, how to return to the map, or what the next action is.
- Repeated actions: open lecture, return to map, choose category, adjust exam settings, answer, flag, move next, review.
- High-risk mistakes: starting the wrong mode, losing current question, confusing planned content with ready content, treating CTF links as internal lessons.

## Design Language

- Information density: balanced. Show enough context for orientation, but keep one primary action per view.
- Primary layout grammar: lecture pages use docs navigation on desktop and top disclosures on mobile; exercise pages keep the current practice/test layout, including mobile bottom tabs outside active exam sessions.
- Primary interaction grammar: selected state, current state, next action, and safe back path are always visible.
- Visual tone: calm, instructional, restrained. Lecture pages use a modern documentation palette; exercise pages use a neutral production-test palette with one blue accent.
- Allowed components: side navigation, bottom tabs, segmented controls, compact lists, bounded cards for selectable units, inline callouts.
- Components/patterns to avoid: decorative dashboards, nested cards, large marketing heroes, ranking/progress gamification, excessive badges.
- Typography/spacing rules: lecture titles and headings may use Noto Serif JP for a quiet documentation tone; Japanese prose and UI use Noto Sans JP; Geist Mono is used for code/numbers; prose keeps a readable width, 8px max radius, stable touch targets, and no horizontal mobile overflow.

## Architecture Grammar

- Source of truth: exam data in `data/exams`, category metadata in `data/categories.json`, learning map in `data/learning-map.json`, UI grammar in `DESIGN.md`.
- Core domain objects: category, question, scenario, answer state, learning node, lesson, practical-lab entry.
- State model: exam runtime state stays in client session/local storage; learning navigation is derived from static data. Practical-lab target state remains with the Debian/Kali lab, while a separate lab service relays only its sanitized projection.
- Naming rules: user-facing labels are Japanese and task-based; code names describe domain purpose, not visual style.
- Boundaries between modules: learning navigation belongs to learning components; public shell owns global navigation; exam session owns answer controls. External rewrites delegate `/lab` and `/api/lab` to the isolated lab deployment; ExamServer never owns raw commands, flags, credentials, or target runtime.
- Things that must not be duplicated: global public navigation, learning tree rendering rules, active/current state rules, category grouping rules.

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
