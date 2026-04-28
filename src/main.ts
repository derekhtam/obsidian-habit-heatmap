import { Plugin, parseYaml } from 'obsidian';
import { HabitEngine } from './engine';
import { DashboardView } from './view';

export default class HabitDashboardPlugin extends Plugin {
    async onload() {
        // register entry point for habit-heatmap code blocks
        this.registerMarkdownCodeBlockProcessor("habit-heatmap", async (source, el, ctx) => {
            
            // parse user config from yaml input
            let config;
            try {
                config = parseYaml(source);
            } catch (e) {
                el.createEl("pre", { text: "Invalid YAML Configuration" });
                return;
            }

            const { STATS = [], XP_SETTINGS = {}, FOLDER = '""' } = config;

            // setup retry logic to handle dataview indexing lag
            let retries = 0;
            const maxRetries = 5;

            const render = () => {
                // check for dataview api dependency
                const dv = (this.app as any).plugins.plugins["dataview"]?.api;
                if (!dv) {
                    el.createEl("h3", { text: "Dataview plugin required" });
                    return;
                }

                const pages = dv.pages(FOLDER);

                // wait and retry if dataview index isn't ready
                if (pages.length === 0 && retries < maxRetries) {
                    retries++;
                    setTimeout(render, 500);
                    return;
                }

                try {
                    const todayStr = window.moment().format('YYYY-MM-DD');
                    const dataMap: Record<string, any> = {};

                    // map daily notes to date keys for fast engine lookup
                    pages.where((page: any) => page.file.day)
                        .forEach((page: any) => {
                            const date = window.moment(page.file.day.toJSDate()).format('YYYY-MM-DD');
                            dataMap[date] = page;
                        });

                    // run logic engine and view renderer
                    const engine = new HabitEngine(STATS, XP_SETTINGS);
                    const view = new DashboardView();
                    const store = engine.process(dataMap, todayStr);

                    // clear container and inject generated dashboard html
                    el.empty();
                    const container = el.createDiv();
                    container.innerHTML = view.renderDashboard(store, STATS, dataMap);

                } catch (error) {
                    // handle and display runtime errors
                    const message = error instanceof Error ? error.message : String(error);
                    el.empty();
                    el.createDiv({ text: `Error: ${message}` });
                }
            };

            render();
        });
    }
}