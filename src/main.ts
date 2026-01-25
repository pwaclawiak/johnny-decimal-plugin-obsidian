import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { isQueuedForChange, isQueueEmpty, scheduleSubtreeRenames,  } from './queuing';
import { JohnnyDecimalPluginSettings } from './settings';


const DEFAULT_SETTINGS: JohnnyDecimalPluginSettings = {
    divergeFromOriginalJD: false,
    flattenedStructure: false,
    foldersInFirstTen: false,
}

export default class JohnnyDecimalPlugin extends Plugin {
    settings: JohnnyDecimalPluginSettings;

    async onload() {
        console.debug('Johnny Decimal Plugin - Loaded');
        await this.loadSettings();
        
        this.app.vault.on('rename', async (file, oldPath) => {
            const fileManager = this.app.fileManager;
            const vault = this.app.vault;

            // Skip handling if queue is not empty - file is not root and subtree is already being processed
            if (!isQueueEmpty() || isQueuedForChange(file.path)) return;

            await scheduleSubtreeRenames(vault, fileManager, file, oldPath, this.settings);
        });

        // Leaving this for later use.
        // this.addCommand({
        //     id: 'open-sample-modal-complex',
        //     name: 'Open sample modal (complex)',
        //     checkCallback: (checking: boolean) => {
        //         // Conditions to check
        //         const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        //         if (markdownView) {
        //             // If checking is true, we're simply "checking" if the command can be run.
        //             // If checking is false, then we want to actually perform the operation.
        //             if (!checking) {
        //                 new SampleModal(this.app).open();
        //             }

        //             // This command will only show up in Command Palette when the check function returns true
        //             return true;
        //         }
        //     }
        // });

        // This adds a settings tab so the user can 

        // This adds a settings tab so the user can configure the plugin
        this.addSettingTab(new JDPluginSettingTab(this.app, this));
    }

    onunload() {
        console.debug('Johnny Decimal Plugin - Unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// Leaving this for later use.
// class SampleModal extends Modal {
//     constructor(app: App) {
//         super(app);
//     }

//     onOpen() {
//         const {contentEl} = this;
//         contentEl.setText('Woah!');
//     }

//     onClose() {
//         const {contentEl} = this;
//         contentEl.empty();
//     }
// }

class JDPluginSettingTab extends PluginSettingTab {
    plugin: JohnnyDecimalPlugin;
    divergeOptionsEl: HTMLDivElement;
    flattenedOptionsEl: HTMLDivElement;

    constructor(app: App, plugin: JohnnyDecimalPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        const plugin_name = "Johnny Decimal";
        this.divergeOptionsEl = containerEl.createDiv();
        this.flattenedOptionsEl = this.divergeOptionsEl.createDiv();

        containerEl.empty();

        new Setting(containerEl)
            .setHeading()
            .setName(`Modify your ${plugin_name}`)
            .setDesc(`Additional, advanced options for customizing your ${plugin_name} system.`)
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.divergeFromOriginalJD)
                .onChange(async (value) => {
                    this.plugin.settings.divergeFromOriginalJD = value;
                    await this.plugin.saveSettings();

                    this.display();
                }));

        this.divergeOptionsEl.createDiv();

        if (this.plugin.settings.divergeFromOriginalJD) {
            new Setting(this.divergeOptionsEl)
                .setName('Flattened folder structure')
                .setDesc('2 levels of folders instead of 3 levels.\
                    Instead of |10-19 life admin| -> |11 me| -> |11.11 hobbies| -> (unnumbered files here), \
                    looks like |10-19 life admin| -> |11 me| -> (*numbered* files here)')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.flattenedStructure)
                    .onChange(async (value) => {
                        this.plugin.settings.flattenedStructure = value;
                        await this.plugin.saveSettings();

                        this.display();
                    }));

            this.flattenedOptionsEl.createDiv();

            if (this.plugin.settings.flattenedStructure) {
                new Setting(this.flattenedOptionsEl)
                    .setName('Allow folders at first 10 prefixes')
                    .setDesc('Allow indexing folders with the first 10 prefixes in category folders e.g. |13.01 my secrets| \
                        where files are indexed starting from |13.11|. Provides additional depth if needed.')
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.foldersInFirstTen)
                        .onChange(async (value) => {
                            this.plugin.settings.foldersInFirstTen = value;
                            await this.plugin.saveSettings();
                        }));
            }
        }

        containerEl.appendChild(this.divergeOptionsEl);
        this.divergeOptionsEl.appendChild(this.flattenedOptionsEl);
        if (!this.plugin.settings.divergeFromOriginalJD) { this.divergeOptionsEl.hide(); return; }
        if (!this.plugin.settings.flattenedStructure) { this.flattenedOptionsEl.hide(); return; }
    }
}
