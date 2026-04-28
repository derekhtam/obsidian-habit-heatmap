import { moment } from "obsidian";

export interface XpConfig {
    type: "multiplier" | "threshold" | "none" | "linear";
    mul?: number;
    base?: number;
    div?: number;
}

export type StatType = "habit" | "metric";
export type StreakType = "positive" | "negative" | "none";
export type DataType = "rating" | "time" | "amount";

export interface Boundaries {
    min: number;
    default: number;
    max: number;
}

export interface ColorConfig {
    type: "absolute" | "relative";
    palette?: string[];
    rgb?: string;
}

export interface StatConfig {
    prop: string;
    title: string;
    type: StatType;
    dataType: DataType;
    streakType: StreakType;
    goal: "up" | "down";
    mastery: number;
    xp: XpConfig;
    unit: string;
    freq: "day" | "week";
    boundaries: Boundaries;
    color: ColorConfig;
}

export interface XpSettings {
    globalFactor: number;
    treeFactor: number;
    taskMultiplier: number;
    minutesPerXp: number;
    sleepBaseHours: number;
    sleepXpMultiplier: number;
}

export interface LevelData {
    level: number;
    progress: number;
    totalXp: number;
    currentXp: number;
    requiredXp: number;
}

export interface RankData {
    name: string;
    cssClass: string;
    progress: number;
    nextRank: string;
}

// internal state tracking for a single habit
export interface HabitData {
    streak: number;
    bestStreak: number;
    cheatDays: number;
    daysSinceMiss: number;
    totalXp: number;
    todayXp: number;
    avg90: number;
    prevAvg90: number;
    maxRecorded: number;
    currentToday: number;
    lifetimeSum: number;
    logs90: number;
    firstLogDate: string | null;
    lifetimeAvg: number;
    rank?: RankData | null;
    mastery?: LevelData;
    atRisk?: boolean;
    isNewPR?: boolean;
    trend?: number;
}

// final payload passed to the view
export interface HabitStore {
    habits: Record<string, HabitData>;
    global: {
        xp: number;
        todayXp: number;
        isPerfectDay: boolean;
        quest: { completed: number; total: number };
        levelData: LevelData;
        title: string;
    };
}

export class HabitEngine {
    stats: StatConfig[];
    settings: XpSettings;

    // init engine
    constructor(statsConfig: StatConfig[], xpSettings: XpSettings) {
        this.stats = statsConfig;
        this.settings = xpSettings;
    }

    // calculate level and progress from total xp
    static getLevelData(totalXp: number, factor: number = 50): LevelData {
        const level = Math.floor(Math.sqrt(totalXp / factor));
        const xpForCurrentLevel = Math.pow(level, 2) * factor;
        const xpForNextLevel = Math.pow(level + 1, 2) * factor;
        const xpRequiredForNext = Math.floor(xpForNextLevel - xpForCurrentLevel);
        const xpProgressInCurrent = Math.floor(totalXp - xpForCurrentLevel);

        return {
            level,
            progress: Math.min(100, (xpProgressInCurrent / xpRequiredForNext) * 100),
            totalXp: Math.floor(totalXp),
            currentXp: xpProgressInCurrent,
            requiredXp: xpRequiredForNext
        };
    }

    // assign rank tier based on average performance
    static getRank(average: number, masteryThreshold: number): RankData | null {
        if (!masteryThreshold) return null;

        const tiers = [
            { name: "Iron", threshold: 0.00 }, { name: "Bronze", threshold: 0.15 },
            { name: "Silver", threshold: 0.35 }, { name: "Gold", threshold: 0.50 },
            { name: "Platinum", threshold: 0.65 }, { name: "Emerald", threshold: 0.80 },
            { name: "Diamond", threshold: 0.95 }
        ];

        const ratio = average / masteryThreshold;
        let idx = 0;

        for (let i = 0; i < tiers.length; i++) {
            const t = tiers[i];
            if (t && ratio >= t.threshold) idx = i; else break;
        }

        const curr = tiers[idx] || { name: "Iron", threshold: 0 };
        const next = tiers[idx + 1] || null;
        let prog = 100;

        if (next) prog = Math.min(100, Math.max(0, Math.floor(((ratio - curr.threshold) / (next.threshold - curr.threshold)) * 100)));

        return { name: curr.name, cssClass: "rank-" + curr.name.toLowerCase(), progress: prog, nextRank: next ? next.name : "MAX" };
    }

    // get cosmetic title based on global level
    static getGlobalTitle(level: number): string {
        if (level >= 100) return "Singularity";
        if (level >= 75) return "Black Hole";
        if (level >= 50) return "Supernova";
        if (level >= 35) return "Star";
        if (level >= 20) return "Planet";
        if (level >= 10) return "Moon";
        if (level >= 5) return "Asteroid";
        return "Space Dust";
    }

    // check if value meets the requirement for a specific streak type
    private isSuccess(value: number, streakType: StreakType): boolean {
        if (streakType === "positive") return value > 0;
        if (streakType === "negative") return value === 0;
        return true;
    }

    // calc xp payout for a single logged value
    static getXP(value: number, config: XpConfig): number {
        if (!config || config.type === "none") return 0;
        switch (config.type) {
            case "multiplier": return value * (config.mul || 1);
            case "threshold": return Math.max(0, value - (config.base || 0)) * (config.mul || 1);
            default: return value / (config.div || 5);
        }
    }

    // sanitize raw input against configured boundaries and fallbacks
    private sanitizeValue(raw: any, boundaries: Boundaries): number {
        if (raw === undefined || raw === null) return boundaries.default;
        const num = Number(raw);

        if (isNaN(num)) return boundaries.default;
        if (num < boundaries.min) return boundaries.min;
        if (num > boundaries.max) return boundaries.max;

        return num;
    }

    // handle streak increments, cheat days, and resets
    private updateStreak(habit: HabitData, isSuccess: boolean, isToday: boolean) {
        if (isSuccess) {
            habit.daysSinceMiss++;
            habit.streak++;
            if (habit.daysSinceMiss >= 4) habit.cheatDays = 1;
            if (habit.streak > habit.bestStreak) habit.bestStreak = habit.streak;
        } else if (!isToday) {
            // consume cheat day or reset streak
            if (habit.streak > 0 && habit.cheatDays > 0) {
                habit.cheatDays = 0;
                habit.daysSinceMiss = 0;
            } else {
                habit.streak = 0;
                habit.daysSinceMiss = 0;
            }
        }
    }

    // main data loop
    process(dataMap: Record<string, any>, todayStr: string): HabitStore {
        // init default payload
        const store: HabitStore = {
            habits: {},
            global: {
                xp: 0, todayXp: 0, isPerfectDay: false,
                quest: { completed: 0, total: 0 },
                levelData: HabitEngine.getLevelData(0, this.settings.globalFactor),
                title: "Space Dust"
            }
        };

        // populate base zero-states for all configured stats
        this.stats.forEach(stat => {
            store.habits[stat.prop] = {
                streak: 0, bestStreak: 0, cheatDays: 0, daysSinceMiss: 0,
                totalXp: 0, todayXp: 0, avg90: 0, prevAvg90: 0,
                maxRecorded: 0, currentToday: stat.boundaries.default,
                lifetimeSum: 0, logs90: 0, firstLogDate: null, lifetimeAvg: 0
            };
        });

        const sortedDates = Object.keys(dataMap).sort();

        // chronologically process all historical data
        sortedDates.forEach(dateString => {
            const pageData = dataMap[dateString];
            const isToday = dateString === todayStr;

            this.stats.forEach(stat => {
                const rawValue = pageData[stat.prop];
                const value = this.sanitizeValue(rawValue, stat.boundaries);
                const habit = store.habits[stat.prop];

                if (!habit) return;
                if (isToday) habit.currentToday = value;

                // track lifetime records if data actually exists in the file
                if (rawValue !== undefined && rawValue !== null) {
                    if (!habit.firstLogDate) habit.firstLogDate = dateString;
                    habit.lifetimeSum += value;
                    if (value > habit.maxRecorded) habit.maxRecorded = value;
                }

                // calculate xp drops
                if (stat.type === "habit") {
                    const xpEarned = HabitEngine.getXP(value, stat.xp);
                    habit.totalXp += xpEarned;
                    store.global.xp += xpEarned;

                    if (isToday) {
                        habit.todayXp = xpEarned;
                        store.global.todayXp += xpEarned;
                    }
                }

                // process streak conditions
                if (stat.streakType !== "none") {
                    const isSuccess = this.isSuccess(value, stat.streakType);
                    this.updateStreak(habit, isSuccess, isToday);
                }
            });
        });

        // resolve rolling averages and final ui flags
        const dateLookup = this.generateDateLookup(todayStr);
        this.stats.forEach(stat => this.calculateFinalMetrics(stat, store, dataMap, dateLookup, todayStr));
        this.calculateGlobalQuest(store);

        return store;
    }

    // precompute the last 180 days for fast lookups
    private generateDateLookup(todayStr: string): string[] {
        const lookup: string[] = [];
        const cursor = window.moment(todayStr, 'YYYY-MM-DD');

        for (let i = 0; i < 180; i++) {
            lookup.push(cursor.format('YYYY-MM-DD'));
            cursor.subtract(1, 'days');
        }

        return lookup;
    }

    // calculate rolling averages, trends, and attach ui status flags
    private calculateFinalMetrics(stat: StatConfig, store: HabitStore, dataMap: any, lookup: string[], todayStr: string) {
        const habit = store.habits[stat.prop];
        if (!habit) return;

        let sumCurrent90 = 0, sumPrevious90 = 0;

        // aggregate the last 90 days vs the 90 days before that
        for (let i = 0; i < 90; i++) {
            const dCur = lookup[i];
            const dPrev = lookup[i + 90];

            if (dCur && dPrev) {
                const rawCur = dataMap[dCur]?.[stat.prop];
                const rawPrev = dataMap[dPrev]?.[stat.prop];

                if (rawCur !== undefined && rawCur !== null) habit.logs90++;

                sumCurrent90 += this.sanitizeValue(rawCur, stat.boundaries);
                sumPrevious90 += this.sanitizeValue(rawPrev, stat.boundaries);
            }
        }

        habit.avg90 = sumCurrent90 / 90;
        habit.prevAvg90 = sumPrevious90 / 90;

        // resolve percentage trend
        habit.trend = (sumPrevious90 === 0)
            ? (habit.avg90 > 0 ? 100 : 0)
            : ((sumCurrent90 - sumPrevious90) / sumPrevious90) * 100;

        const daysLife = habit.firstLogDate ? window.moment().diff(window.moment(habit.firstLogDate), 'days') + 1 : 1;
        habit.lifetimeAvg = habit.lifetimeSum / daysLife;

        // resolve rpg elements
        if (stat.type === "habit") {
            habit.rank = HabitEngine.getRank(habit.avg90, stat.mastery);
            habit.mastery = HabitEngine.getLevelData(habit.totalXp, this.settings.treeFactor);
        }

        // set ui state flags
        const successToday = this.isSuccess(habit.currentToday, stat.streakType);
        habit.atRisk = (stat.streakType === "positive" && !successToday && habit.streak > 0 && habit.cheatDays === 0);
        habit.isNewPR = (stat.streakType !== "none" && habit.streak > 1 && habit.streak >= habit.bestStreak);
    }

    // calculate today's quest completion ratio
    private calculateGlobalQuest(store: HabitStore) {
        // quest objectives are explicitly things marked as a 'habit'
        const questStats = this.stats.filter(s => s.type === "habit");

        store.global.quest.total = questStats.length;
        store.global.quest.completed = questStats.filter(s => {
            const habit = store.habits[s.prop];
            // verify habit exists before checking success
            return habit ? this.isSuccess(habit.currentToday, s.streakType) : false;
        }).length;

        // resolve perfect day global xp bonus
        if (store.global.quest.total > 0 && store.global.quest.completed === store.global.quest.total) {
            store.global.isPerfectDay = true;
            store.global.xp += 100;
            store.global.todayXp += 100;
        }

        store.global.levelData = HabitEngine.getLevelData(store.global.xp, this.settings.globalFactor);
        store.global.title = HabitEngine.getGlobalTitle(store.global.levelData.level);
    }

}