# AGENTS.md

## Project Context

This repository is a static, highly functional web platform for an agrivoltaics / agro-collaboration network.

Root path:

```txt
C:\HELLOWORLD\AgroCollaboration_CODEX_6_9_26
```

The site is built from static HTML, CSS, and vanilla JavaScript. It is not a React, Next.js, Vite, or framework app. Treat the current functionality as valuable and working.

Primary files include:

```txt
index.html
about.html
admin.html
archive.html
benchmark.html
committee.html
map.html
network.html
organizations.html
profile.html
sanity_check.html
scholar.html
scholar_calibration.html
signin.html
styles.css
theme.js
layout.js
ui.js
auth.js
auth-preloader.js
clickprofile.js
copy.js
event.js
map.js
membership.js
rich-text.js
tailwind.config.js
static/
static/js/event.js
```

Static assets include photos, logos, screenshots, and profile images under:

```txt
static/
```

## Mission

Elevate the entire working website into a visually unified, modern, premium, mobile-first, 2026-quality web experience.

The priority order is:

1. Preserve existing functionality.
2. Standardize styling, aesthetic, spacing, typography, branding, and layout behavior across every page.
3. Improve mobile friendliness across small phones, large phones, tablets, and desktop.
4. Make the site feel bold, polished, editorial, scientific, credible, and high-end.
5. Avoid fragile rewrites, unnecessary abstractions, and changes that increase risk.

This is a visual and UX elevation pass, not a product logic rewrite.

## Non-Negotiable Constraints

Do not break existing functionality.

Do not remove working features.

Do not rewrite the project into a framework.

Do not introduce a build system unless one already exists and is required.

Do not add external runtime dependencies unless absolutely necessary.

Do not replace existing copy/content unless needed for labels, accessibility, or obvious typo-level fixes.

Do not remove or rename existing IDs, classes, `data-*` attributes, event hooks, script references, auth hooks, map hooks, or admin hooks unless you verify all dependent code and update it safely.

Do not break login, profile, membership, map, scholar, benchmark, admin, committee, archive, organization, or network functionality.

Do not make purely decorative changes that compromise readability, accessibility, or performance.

Do not use generic AI-looking gradients everywhere. The final visual system should feel intentional, editorial, premium, and specific to agrivoltaics / research collaboration.

## Design Direction

The site should feel like a cutting-edge 2026 research, climate, agriculture, and collaboration platform.

Target feel:

* Premium scientific network
* Modern institutional credibility
* Editorial landing-page quality
* Awwwards-level polish without sacrificing clarity
* Clean, calm, luminous, and highly usable
* Sophisticated rather than flashy
* Warm agrivoltaics / desert / solar / research identity

Recommended aesthetic language:

* Deep neutral base
* Warm solar accent
* Botanical/agricultural secondary accent
* Soft glass or translucent panels where appropriate
* Strong editorial typography hierarchy
* Large confident hero sections
* Refined cards and profile modules
* Better rhythm between sections
* Modern buttons and navigation
* Responsive image treatment
* Subtle motion only where it improves clarity

Avoid:

* Overused purple/blue AI SaaS gradients
* Excessive neon
* Low-contrast text
* Tiny mobile tap targets
* Layouts that only look good on desktop
* Heavy animation
* Visual inconsistency between pages

## Styling System Requirements

Create or refine a centralized design system in `styles.css` and related theme files.

Use CSS custom properties for core tokens:

```css
:root {
  --color-bg: ...;
  --color-surface: ...;
  --color-surface-elevated: ...;
  --color-text: ...;
  --color-muted: ...;
  --color-border: ...;
  --color-accent: ...;
  --color-accent-2: ...;

  --font-sans: ...;
  --font-display: ...;

  --radius-sm: ...;
  --radius-md: ...;
  --radius-lg: ...;
  --radius-xl: ...;

  --shadow-sm: ...;
  --shadow-md: ...;
  --shadow-lg: ...;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

Use a consistent 4px spacing rhythm.

Use a limited palette:

* One primary neutral base
* One warm solar/agriculture accent
* One optional secondary botanical/research accent

Do not create random page-specific colors unless clearly justified.

Unify:

* Buttons
* Cards
* Inputs
* Selects
* Modals
* Navigation
* Header
* Footer
* Profile cards
* Organization cards
* Event cards
* Scholar cards
* Admin panels
* Map panels
* Tables
* Empty states
* Badges
* Chips
* Search/filter controls

Prefer reusable CSS classes over duplicated one-off styling.

## Page-Level Goals

### `index.html`

Make the homepage feel like the flagship entry point.

Improve:

* Hero composition
* Clear value proposition
* Visual rhythm
* CTA hierarchy
* Section spacing
* Image treatment
* Credibility indicators
* Mobile hero stacking

Keep all links and scripts working.

### `about.html`

Make it feel editorial and credible.

Improve:

* Mission narrative layout
* Section hierarchy
* Image/caption presentation
* Long-form readability
* Mobile spacing

### `committee.html`

Make people/profile presentation premium and consistent.

Improve:

* Profile grid
* Image cropping
* Name/title hierarchy
* Card spacing
* Mobile wrapping
* Accessibility for images

### `network.html`

Make collaboration/network discovery feel modern and structured.

Improve:

* Filters/search UI
* Organization/person cards
* Dense information readability
* Responsive layout

### `organizations.html`

Unify organization cards with the rest of the site.

Improve:

* Logo/image handling
* Card rhythm
* Metadata badges
* Mobile layout
* Empty/loading states if present

### `profile.html`

Improve profile readability and polish.

Preserve profile loading/editing behavior.

Improve:

* Avatar/image layout
* Sections
* Editable fields
* Buttons
* Responsive behavior
* Auth-dependent states

### `map.html` and `map.js`

Do not break the map.

Improve only safe surrounding UI:

* Panels
* Controls
* Search/filter areas
* Legend/cards
* Mobile overlay layout

Be careful with dimensions, IDs, event listeners, and map initialization.

### `scholar.html` and `scholar_calibration.html`

Make scholarly/research workflows feel serious, precise, and polished.

Improve:

* Search/input UI
* Result cards
* Tables/lists
* Calibration panels
* Loading and empty states
* Mobile readability

### `benchmark.html` and `test_benchmark_scholarhtml`

Improve readability and utility.

Preserve benchmark logic.

Improve:

* Tables
* Result panels
* Controls
* Status indicators
* Responsive overflow handling

### `admin.html`

Do not break admin functionality.

Improve:

* Dashboard layout
* Tables
* Filters
* Cards
* Status badges
* Mobile fallback
* Overflow behavior

### `signin.html`

Make authentication feel polished and trustworthy.

Preserve auth behavior.

Improve:

* Form layout
* Button states
* Mobile centering
* Error/success states
* Visual hierarchy

### `archive.html`

Improve content browsing.

Preserve archive links and scripts.

Improve:

* Card/list presentation
* Date/category labels
* Responsive layout
* Long-title handling

### `sanity_check.html`

Keep utility/debug purpose clear.

Improve readability without overdesigning.

## JavaScript Safety Rules

Before changing JavaScript, inspect the relevant HTML and dependent scripts.

Preserve:

* Existing global functions
* Event listener behavior
* Auth flow
* Map initialization
* Profile click behavior
* Membership behavior
* Rich text behavior
* Admin behavior
* Scholar/benchmark behavior

Allowed JavaScript changes:

* Safe class toggles for improved UI states
* Progressive enhancement
* Better mobile nav behavior
* Reduced layout thrash
* Defensive guards
* Accessibility improvements
* Non-breaking UI initialization

Avoid:

* Replacing working logic wholesale
* Changing API contracts
* Removing globals
* Renaming functions used in HTML
* Adding large animation libraries
* Blocking render with heavy JS
* Making scripts order-dependent in fragile ways

## Mobile Requirements

The site must work well on:

* 320px small phones
* 375px iPhones
* 390px–430px modern phones
* 768px tablets
* 1024px tablets/small laptops
* Desktop widths

Requirements:

* No horizontal scrolling unless inside intentional data tables.
* Tap targets should generally be at least 44px high/wide.
* Navigation must be usable on mobile.
* Cards must stack cleanly.
* Images must not overflow.
* Tables must have responsive overflow wrappers.
* Forms must be usable with mobile keyboards.
* Text must remain readable without zooming.
* Sticky/fixed elements must not cover critical content.
* Map/admin/scholar interfaces must remain usable on small screens.

## Accessibility Requirements

Improve accessibility as part of the visual pass.

Requirements:

* Semantic HTML where practical.
* Meaningful `alt` text for important images.
* Empty `alt=""` only for purely decorative images.
* Visible focus states.
* Keyboard navigability for buttons, links, nav, forms, dialogs, and interactive cards.
* Proper label associations for inputs.
* Sufficient color contrast.
* Avoid text embedded in images where HTML text is possible.
* Respect `prefers-reduced-motion`.
* Avoid motion that blocks interaction or causes discomfort.

## Performance Requirements

Keep the static site fast.

Requirements:

* Avoid large dependencies.
* Avoid heavy animations.
* Use CSS transitions carefully.
* Prefer transform/opacity for motion.
* Do not introduce expensive scroll listeners.
* Avoid layout thrashing.
* Keep image handling responsive.
* Use `loading="lazy"` for non-critical images where safe.
* Use `decoding="async"` where safe.
* Do not degrade map performance.
* Do not block initial rendering with unnecessary JS.

## Visual Implementation Guidance

Use modern CSS techniques where supported:

* CSS variables
* `clamp()` for fluid typography and spacing
* `minmax()` and `auto-fit` for responsive grids
* Logical properties where useful
* Container-like patterns when safe
* Modern focus-visible styling
* Responsive image sizing
* Layered backgrounds and subtle texture

Recommended patterns:

```css
.section {
  padding-block: clamp(3rem, 7vw, 7rem);
}

.container {
  width: min(100% - 2rem, 1180px);
  margin-inline: auto;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: clamp(1rem, 2vw, 1.5rem);
}
```

Use tasteful details:

* Very subtle gradients
* Soft borders
* Modern shadows
* Better image masks/crops
* Elegant hover states
* Clear pressed/focus states
* Refined badges
* Better typography scale

## Verification Checklist

Before finishing, verify:

* Every HTML page still loads.
* No obvious console errors introduced.
* Navigation links still work.
* Auth pages still reference the correct scripts.
* Map still initializes.
* Profile interactions still work.
* Admin page still works.
* Scholar and benchmark pages still work.
* Mobile layout works at 320px, 375px, 430px, 768px, 1024px, and desktop.
* No unintended horizontal scroll.
* Images are not distorted.
* Buttons and inputs are usable on mobile.
* Focus states are visible.
* Reduced motion is respected.
* Existing content remains present.
* Existing scripts are still loaded in the correct order.

## Expected Output From Codex

When making changes:

1. Inspect the project first.
2. Identify shared styling patterns and inconsistencies.
3. Refactor toward a centralized design system.
4. Apply visual improvements across all pages.
5. Make only safe, non-breaking JavaScript changes.
6. Verify the site manually through file inspection and available local checks.
7. Summarize changed files and the reason for each change.
8. Explicitly list any risky areas checked.
9. Explicitly state any functionality left untouched.

## Final Standard

The final site should feel like one cohesive product, not a collection of separately styled pages.

It should look modern, premium, and research-grade while preserving the reliability of the existing static implementation.
