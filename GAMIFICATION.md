# Gamification System

## Stat Types

Each stat is either a **habit** or a **metric**.

- **Habits** earn XP, have mastery levels, ranked tiers, and count toward the daily quest.
- **Metrics** are display-only — they get heatmaps, averages, and streaks, but no XP or leveling.

## XP

Habits earn XP each day based on the logged value and the `xp` config. There are four XP types:

| Type | Formula | Example Use |
|------|---------|-------------|
| `linear` | `value / div` | Boolean habits (`div: 1` = 1 XP per completion) |
| `multiplier` | `value × mul` | Scale XP directly with effort |
| `threshold` | `max(0, value - base) × mul` | Only earn XP above a baseline |
| `none` | `0` | No XP earned |

### Perfect Day Bonus

When all habits are completed in a single day, a +100 XP bonus is added to the global total.

## Leveling

XP feeds into two independent leveling systems, both using the formula:

```
level = floor(sqrt(totalXp / factor))
```

### Global Level

Accumulated XP from all habits combined. Controlled by `globalFactor` in `XP_SETTINGS` (default 30). Lower factor = faster leveling. Each level unlocks a cosmetic title:

| Level | Title |
|-------|-------|
| 0–4 | Space Debris |
| 5–9 | Asteroid Rider |
| 10–19 | Moon Wanderer |
| 20–29 | Planetary Pioneer |
| 30–39 | Comet Chaser |
| 40–49 | Star Surfer |
| 50–59 | Supernova Soul |
| 60–69 | Galactic Guardian |
| 70–79 | Void Walker |
| 80–89 | Event Horizon |
| 90–99 | Cosmic Entity |
| 100+ | Singularity |

### Per-Habit Mastery

Each habit has its own XP pool and level, controlled by `treeFactor` in `XP_SETTINGS` (default 50). Displayed as "Lvl X" on the card.

For example, reaching level 5 with `treeFactor: 50` requires `5² × 50 = 1250 XP`.

## Ranks

Habits are assigned a competitive tier based on 90-day average performance relative to the `mastery` threshold. Tiers from lowest to highest:

- Iron
- Bronze
- Silver
- Gold
- Diamond

Each rank badge shows progress toward the next tier.

## Streaks

Each stat has a `streakType` that determines how streaks are counted:

| Streak Type | Increments When | Use Case |
|-------------|----------------|----------|
| `positive` | Value > 0 | Habits you want to do (exercise, meditation) |
| `negative` | Value = 0 | Habits you want to avoid (smoking, junk food) |
| `none` | N/A | No streak tracking (mood, weight) |

### Cheat Days

Positive streaks earn 1 cheat day for every 4 consecutive days. A cheat day absorbs a single missed day without breaking the streak. Negative streaks break immediately on any non-zero value.

### At-Risk Warning

A ⚠️ icon appears when you have an active streak but haven't completed the habit today. If the day ends without logging, the streak breaks (unless you have a cheat day banked).

## Color Modes

Each stat's heatmap cells are colored using one of two modes:

### Relative

A single RGB color with opacity that scales from 0.2 to 1.0 based on the value relative to your all-time maximum. Higher values = more vivid. Early on with limited data, most non-zero days will appear similar since the max is low.

### Absolute

A 3-color gradient mapped to boundaries, with `default` as the midpoint:

- Values from `min` to `default` interpolate between color 1 and color 2
- Values from `default` to `max` interpolate between color 2 and color 3

Best for ratings where distinct ranges have meaning (e.g., mood: red → yellow → green).

## Daily Quest

The quest bar tracks how many habits (not metrics) are completed today. Completing all habits triggers the perfect day bonus and a glow effect on the global XP bar.
