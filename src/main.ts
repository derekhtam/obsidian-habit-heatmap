import { Plugin, parseYaml } from "obsidian";
import { HabitEngine } from "./engine";
import { DashboardView } from "./view";

export default class HabitDashboardPlugin extends Plugin {
	async onload() {
		// Register entry point for habit-heatmap code blocks
		this.registerMarkdownCodeBlockProcessor(
			"habit-heatmap",
			async (source, el, ctx) => {
				console.log("Dashboard: Block Triggered");

				// Parse user config from YAML input
				let config;
				try {
					config = parseYaml(source);
					if (!config) throw new Error("YAML is empty or invalid");
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					el.createEl("pre", { text: `YAML Error: ${msg}` });
					return;
				}

				const { STATS = [], XP_SETTINGS = {}, FOLDER = '""' } = config;

				// Setup retry logic to handle Dataview indexing lag
				let retries = 0;
				const maxRetries = 5;

				const render = () => {
					// Check for Dataview API dependency
					const dv = (this.app as any).plugins.plugins["dataview"]
						?.api;
					if (!dv) {
						el.createEl("h3", { text: "Dataview plugin required" });
						return;
					}

					const pages = dv.pages(FOLDER);

					// Wait and retry if Dataview index isn't ready
					if (pages.length === 0 && retries < maxRetries) {
						retries++;
						setTimeout(render, 500);
						return;
					}

					try {
						const todayStr = window.moment().format("YYYY-MM-DD");
						const dataMap: Record<string, any> = {};

						// Map daily notes to date keys for fast engine lookup
						pages
							.where((page: any) => page.file.day)
							.forEach((page: any) => {
								const date = window
									.moment(page.file.day.toJSDate())
									.format("YYYY-MM-DD");
								dataMap[date] = page;
							});

						// Run logic engine and view renderer
						const engine = new HabitEngine(STATS, XP_SETTINGS);
						const view = new DashboardView();
						const store = engine.process(dataMap, todayStr);

						// Clear container and inject generated dashboard HTML
						el.empty();
						const container = el.createDiv();
						container.innerHTML = view.renderDashboard(
							store,
							STATS,
							dataMap,
						);
						console.log("Habit Heatmap: Render Successful");
					} catch (error) {
						// Handle and display runtime errors
						const message =
							error instanceof Error
								? error.message
								: String(error);
						console.error("Habit Heatmap: Render Error:", error);
						el.empty();
						el.createDiv({ text: `Render Error: ${message}` });
					}
				};

				render();

				// listens for changes to tracked properties and re-renders view
				let lastValues: Record<string, Record<string, any>> = {};

				const snapshotTrackedValues = (): Record<
					string,
					Record<string, any>
				> => {
					const dv = (this.app as any).plugins.plugins["dataview"]
						?.api;
					if (!dv) return {};

					const cutoff = window.moment().subtract(90, "days");
					const snapshot: Record<string, Record<string, any>> = {};

					dv.pages(FOLDER)
						.where(
							(p: any) =>
								p.file.day &&
								window
									.moment(p.file.day.toJSDate())
									.isSameOrAfter(cutoff),
						)
						.forEach((p: any) => {
							const date = window
								.moment(p.file.day.toJSDate())
								.format("YYYY-MM-DD");
							snapshot[date] = {};
							for (const stat of STATS) {
								snapshot[date][stat.prop] = p[stat.prop];
							}
						});

					return snapshot;
				};

				lastValues = snapshotTrackedValues();

				const ref = this.app.workspace.on(
					"dataview:refresh-views" as any,
					() => {
						console.log("Habit Heatmap: refresh-views event fired");
						const currentValues = snapshotTrackedValues();
						const changed = Object.keys(currentValues).some(
							(date) =>
								STATS.some(
									(s: any) =>
										currentValues[date]?.[s.prop] !==
										lastValues[date]?.[s.prop],
								),
						);

						if (changed) {
							console.log(
								"Habit Heatmap: tracked property changed, re-rendering!",
							);
							lastValues = currentValues;
							render();
						}
					},
				);
				this.register(() => this.app.workspace.offref(ref));
			},
		);
	}
}
