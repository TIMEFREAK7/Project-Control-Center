# PCC UX Rules

PCC should feel professional, calm, precise, structured, trustworthy — Impeccable's "Operate mode"
(app UI/dashboard/tool, the visitor is in a task) is the correct register for every screen in this
app; none of PCC is a Persuade (marketing) or Experience (portfolio/showcase) surface, so none of
those registers' permissions (bold hero moments, decorative motion, display typography) apply here.

PCC must NOT feel like: generic SaaS filler, a generic AI dashboard, a marketing site, a
cryptocurrency dashboard, a consumer productivity app, or a visual-design experiment. The bar,
per Impeccable's "product slop test": can a category-fluent user (someone who's used MS Project,
Primavera P6, or any project-controls tool) trust the interface immediately, or do they pause at
every subtly-off component? Familiarity is a feature, not a failure of imagination.

## Avoid

Excessive gradients, excessive glassmorphism, unnecessary shadows on resting elements (already
enforced — see DESIGN_SYSTEM.md's elevation rule), decorative/orchestrated motion, tiny
unreadable text, arbitrary one-off colour usage outside the status vocabulary, inconsistent
component patterns (same action rendered differently on two screens), reinvented standard
affordances (custom scrollbars, non-standard modals, invented form controls) — a data-entry-heavy
project-controls app is exactly where a user's muscle memory from every other tool needs to keep
working.

## Information density

PCC contains genuinely dense professional data (activities, risks, requirements, delay chains).
**Do not solve density by shrinking text or padding indiscriminately.** Use hierarchy, grouping,
progressive disclosure (expandable Details panels — already the established pattern, e.g.
Portfolio's per-project Details panel), filtering, focused views, contextual actions, and
meaningful whitespace instead. The goal is high information *clarity*, not maximum information
per pixel — a distinction this app has already gotten right in several places (the risk heat-map
click-to-filter, Executive Center's per-project summary sections) and should keep getting right in
new work.

Product UI (per Impeccable's Operate-mode permissions) is explicitly allowed density that a
marketing surface couldn't: dense tables, many-labeled panels, tabular content up to 120ch+ wide.
Don't over-correct density into sparseness either — this isn't a consumer app.

## Consistency

Same action, same component, everywhere. If "Save" looks different on two screens, one of them is
wrong — literally Impeccable's own product-constraint list. This app already has one shared nav
renderer for desktop sidebar and mobile drawer (Gate 4); that discipline should extend to every
shared interaction, not just navigation.

## Empty / loading / error / confirmation states

Every list/table view needs a real empty state that orients the user (not a bare "no data"), a
loading state (skeleton preferred over a spinner sitting in otherwise-empty content, per
Impeccable's component-states rule), and delete/deactivate actions need the confirmation-prompt
pattern already established app-wide (Documents' delete, every register's delete). New work should
match the existing pattern, not invent a new one.

## Terminology

Match project-controls vocabulary throughout: Activity/WBS, float/critical path, RFI/TQ, EVM
terms (CPI/SPI/EAC), baseline/status date, submittal — these already appear correctly across the
app; a UI change should never soften or genericize this vocabulary for a "friendlier" feel. This
is a tool for someone who already knows what a total float is.

## Motion and accessibility

See `MOTION_SYSTEM.md` and `.claude/skills/pcc-ui/SKILL.md`'s accessibility section — summarized
here: motion communicates state, never decorates; never use colour alone to signal status (every
`.status-badge` already carries text, not just colour — keep that convention for anything new);
keyboard operability and visible focus are not optional for a desktop-first professional tool.

## Project assignment (standing, non-negotiable — see CLAUDE.md)

Project assignment is mandatory on every register. Never add an "Unassigned" option back to any
UI — this was explicitly reverted once already and the reasoning (an entry with nowhere to surface
defeats the point of a tracker) applies to any future screen too.
