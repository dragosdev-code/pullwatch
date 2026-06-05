---
title: Inside the Popup
description: Tabs, sorting, badges, empty states, and the settings panel.
---

Most of these docs explain what happens in the background. This page is the other side of the glass: what the popup actually shows you, and why it shows it that way. It is the closest thing to a user manual, written against the same code as everything else, so the tab counts, sort rules, empty-state copy, and settings defaults here are the real ones.

The popup is a single React app that boots fresh every time you open it and paints from `chrome.storage.local` before its first frame. How the data gets there is covered in [Data Hydration and Storage](/architecture/data-hydration-and-storage/); this page assumes the data has already arrived and looks at how it is laid out.

---

## The popup at a glance

From top to bottom, the popup is always the same five regions:

| Region | What it holds |
| --- | --- |
| **Header** | The "last updated" label and the manual [refresh button](/architecture/popup-and-background-communication/#what-the-refresh-button-shows). |
| **Banners** | A dismissable global-error strip, then the [parser-breakage](/architecture/github-health/) and [outage](/architecture/github-health/outage-banner/) banners when they apply. |
| **Tabs** | To Review, Authored, Merged, each with a live count. |
| **List** | The pull requests for the active tab. |
| **Settings gear** | A fixed control in the bottom-right corner that opens the settings overlay. |

Everything below unpacks the tabs, the list states, the toolbar badge, and the settings panel.

---

## The three tabs

There are exactly three tabs. The default on open is **To Review**.

| Tab | Label shown | Count means | Order |
| --- | --- | --- | --- |
| `assigned` | **To Review** | PRs awaiting your review (pending only) | Pending first, then already reviewed |
| `authored` | **Authored** | All of your open authored PRs | Grouped by review state (see below) |
| `merged` | **Merged** | All recently merged PRs | As returned, newest GitHub order |

A subtle point worth stating plainly: the **To Review** count is *not* the total number of rows on the tab. It counts only the PRs still pending your review, so a tab that shows three reviewed PRs and zero pending reads as `0`. The toolbar badge uses the same pending count, which is covered further down.

### To Review

The assigned list splits into two blocks: PRs still **pending** your review render first, then PRs you have **already reviewed** render below them, visually de-emphasised. The reviewed block is there so a PR does not vanish the instant you review it (which would feel like it was lost), but it stays out of the way of the work that still needs you.

### Authored

The authored tab groups your PRs by their current review state and renders the groups in a fixed priority order, so the ones that need your attention sit at the top:

1. Changes requested
2. Approved
3. Pending
4. Commented
5. Draft

Only non-empty groups appear, so the tab never shows an empty heading. Each row carries a small status badge that names its state:

| State | Badge label | Colour cue |
| --- | --- | --- |
| `changes_requested` | **Changes** | Error (red) |
| `approved` | **Approved** | Success (green) |
| `pending` | **Pending** | Warning (amber) |
| `commented` | **Commented** | Info (blue) |
| `draft` | **Draft** | Neutral (grey) |

These badges are unique to the Authored tab, because it is the only tab where the review state is *about your own PR* rather than a request aimed at you.

### Merged

The merged tab is the simplest: it renders the stored list in the order GitHub returned it, with no client-side regrouping. It is a record of recently shipped work, so order and grouping matter less than just having it on hand.

---

## New, reviewed, and seen

PRs that arrived since you last looked are marked **new** and animate in when the tab is shown. The "new" marker is cleared the moment you leave the tab: switching away marks every currently visible new PR as seen, so it does not keep pulsing the next time you open the popup. Reviewed PRs never animate, even if they are technically new, because the entrance flourish is meant to draw your eye to work that still needs doing.

This is purely a popup-side affordance. Whether a PR fires a desktop notification and a sound is a separate decision made in the background, described in [Notifications and Sound](/architecture/notifications-and-sound/).

---

## Empty and first-load states

The list area has two distinct "nothing to show" states, and they say different things on purpose.

Before the very first successful load (a freshly installed extension that has not fetched yet), every tab shows the same call to action:

> Click the refresh button to load your PRs

Once a load has happened and the list is genuinely empty, each tab shows its own quiet message instead:

| Tab | Message | Subtext |
| --- | --- | --- |
| To Review | "No PRs to review" | "PRs requesting your review will appear here" |
| Authored | "No PRs authored by you" | "PRs you authored will appear here" |
| Merged | "No merged PRs" | "Merged PRs will appear here" |

The split matters: "click refresh" means Pullwatch has not looked yet, while "No PRs to review" means it looked and there genuinely is nothing. Confusing the two would make an empty inbox look broken.

---

## The toolbar badge

The number on the Pullwatch toolbar icon is the **pending To Review count**, the same figure as the To Review tab. It respects the **Show drafts in list** setting, so a draft you have chosen to hide does not inflate the badge.

| Badge | Meaning |
| --- | --- |
| (blank) | Nothing pending |
| `1` to `99` | That many pending reviews |
| `99+` | More than ninety-nine pending |
| `...` | A fetch is in progress |
| `!` | Parser breakage or a GitHub outage flag is set |

The badge is derived from storage every time the worker wakes, without a GitHub round trip, so it is correct even on a cold start before any fetch runs. The error state takes precedence: when a parser-breakage or outage flag is set, the badge shows `!` rather than a count, because a stale count during an outage would be misleading.

---

## The settings panel

The gear in the bottom-right corner opens the settings overlay. Changes auto-save as you make them (debounced), so there is no save button to remember. The panel is organised into a few sections.

### To Review notifications

| Setting | Default | What it does |
| --- | --- | --- |
| **Enable notifications** | On | Desktop alerts when a new PR needs your review. |
| **Notify on drafts** | Off | Also alert for draft PRs assigned to you. |
| **Sound** | `ping` | The sound played with an assigned alert (with an on/off toggle). |
| **Show drafts in list** | On | Whether draft PRs appear in the To Review list (and count toward the badge). |

There is a guardrail here: turning **Notify on drafts** on while **Show drafts in list** is off is treated as off, because alerting on a PR you cannot see in the list would be a dead-end. The full reasoning is in [Notifications and Sound](/architecture/notifications-and-sound/#drafts-are-off-by-default).

### Merged notifications

| Setting | Default | What it does |
| --- | --- | --- |
| **Enable notifications** | Off | Desktop alerts when one of your PRs is merged (opt-in). |
| **Sound** | `bell` | The sound played with a merged alert. |

Each notification section has a **Preview** button that fires a sample notification so you can hear the sound and see the toast. It is throttled to roughly one preview every five seconds, and it surfaces a clear message if Chrome itself is blocking notifications.

### Custom sounds

Beyond the built-in sounds you can upload your own. The custom-sound editor lets you drop in a WAV file, trim it to the slice you want, and save it to a slot, after which it behaves like any other sound choice. If a saved custom sound is ever missing (for example on a second machine that has not downloaded it yet), playback falls back to `ping` rather than going silent. The storage and playback mechanics live in [Notifications and Sound](/architecture/notifications-and-sound/#custom-sounds-worker-reads-offscreen-plays).

### Behaviour

| Setting | Default | What it does |
| --- | --- | --- |
| **Link opening behaviour** | Foreground | **Foreground** switches to the new tab and closes the popup; **Background** opens the PR silently and keeps the popup open. |

### Appearance

| Setting | Default | What it does |
| --- | --- | --- |
| **Popup size** | Compact | Three preset shells: Compact (380 × 400), Cozy (418 × 440), Comfortable (456 × 480). |
| **Theme** | (DaisyUI default) | One of 35 built-in DaisyUI themes, with a button to pick one at random. |

---

## Switching GitHub accounts

Pullwatch reads whichever GitHub session your browser holds, so signing into a different GitHub account changes whose PRs it should show. The next fetch notices the viewer identity changed, clears the cached route hint, and rebaselines the lists for the new account rather than diffing them against the previous account's PRs. That last part is what stops an account switch from firing a wall of "new PR" notifications for PRs that were simply never yours on this account. The storage-integrity side of this (how Pullwatch avoids ever pairing one account's identity with another's stored lists) is in [Data Hydration and Storage](/architecture/data-hydration-and-storage/#identity-and-account-switching).

When the popup sees the stored identity change to a different login, it reloads its three PR lists from storage (the new account's lists, which the fetch wave has already written) instead of clearing them to empty. That keeps the switch from briefly showing blank lists while still never rendering the previous account's rows. A first sign in (no previous login) is not treated as a switch, so the lists the wave just seeded stay put.

---

## Hidden extras

Two things stay out of the way until you find them: a small squash minigame that reveals itself after the popup has been opened enough times, and a developer-only debug panel with a deliberately obscure way in. Neither is part of normal use; the minigame has its own [external docs](https://github.com/dragosdev-code/pullwatch/tree/main/src/components/squash-minigame/docs).

---

## Where to go next

- [Data Hydration and Storage](/architecture/data-hydration-and-storage/): how the lists you see here get into the popup before the first paint.
- [Popup and Background Communication](/architecture/popup-and-background-communication/): how the refresh button and settings saves talk to the worker.
- [Notifications and Sound](/architecture/notifications-and-sound/): when a row in these lists also becomes a desktop alert.
- [Onboarding and Session Gates](/architecture/onboarding-and-session-gates/): what the popup shows before any of these tabs are safe to display.
