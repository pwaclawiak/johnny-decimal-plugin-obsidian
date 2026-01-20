import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { isQueuedForChange, isQueueEmpty, scheduleSubtreeRenames,  } from './queuing';
import { JohnnyDecimalPluginSettings } from './settings';


const DEFAULT_SETTINGS: JohnnyDecimalPluginSettings = {
    divergeFromOriginalJD: false,
    flattenedStructure: false,
    foldersInFirstTen: false,
}

// Active plugin handle for subtree processor access.
export let activePlugin: JohnnyDecimalPlugin | null = null;


export default class JohnnyDecimalPlugin extends Plugin {
    settings: JohnnyDecimalPluginSettings;

    async onload() {
        console.log('Johnny Decimal Plugin - Loaded');
        await this.loadSettings();

        // expose plugin instance for subtree processor
        activePlugin = this;
        
        // TODO: use the fileManager to rename files instead of vault.rename to make sure links are updated
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

        // This adds a settings tab so the user can configure the plugin
        this.addSettingTab(new JDPluginSettingTab(this.app, this));
    }

    onunload() {
        activePlugin = null;
        console.log('Johnny Decimal Plugin - Unloaded');
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
        this.divergeOptionsEl = containerEl.createDiv();
        this.flattenedOptionsEl = this.divergeOptionsEl.createDiv();

        containerEl.empty();

        new Setting(containerEl)
            .setHeading()
            .setName('Use modified approach to Johnny Decimal')
            .setDesc('Without this setting you get a standard Johnny Decimal system as described by Johnny. \
                Turning it ON allows for structure modifications to \'better\' fit Obsidian\'s capabilities \
                of vault-wide file search. It is a way that I worked and it fits my needs.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.divergeFromOriginalJD)
                .onChange(async (value) => {
                    this.plugin.settings.divergeFromOriginalJD = value;
                    value ? this.divergeOptionsEl.show() : this.divergeOptionsEl.hide();
                    await this.plugin.saveSettings();
                }));

        this.divergeOptionsEl.createDiv();

        new Setting(this.divergeOptionsEl)
            .setName('Flattened folder structure')
            .setDesc('2 levels of folders instead of 3 levels. \
                Instead of |10-19 Life admin| -> |11 Me| -> |11.11 Hobbies| -> (unnumbered files here), \
                looks like |10-19 Life admin| -> |11 Me| -> (*numbered* files here)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.flattenedStructure)
                .onChange(async (value) => {
                    this.plugin.settings.flattenedStructure = value;
                    value ? this.flattenedOptionsEl.show() : this.flattenedOptionsEl.hide();
                    await this.plugin.saveSettings();
                }));

        this.flattenedOptionsEl.createDiv();

        new Setting(this.flattenedOptionsEl)
            .setName('Allow folders at first 10 IDs')
            .setDesc('Allow indexing subfolders with the first 10 IDs in category folders (e.g. |11.01 My secrets|) \
                on the same level where files are stored with IDs starting from xx.11. It provides additional \
                depth for further categorization on the same level where *notes and regular files* reside.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.foldersInFirstTen)
                .onChange(async (value) => {
                    this.plugin.settings.foldersInFirstTen = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.appendChild(this.divergeOptionsEl);
        this.divergeOptionsEl.appendChild(this.flattenedOptionsEl);
        if (!this.plugin.settings.divergeFromOriginalJD) { this.divergeOptionsEl.hide(); return; }
        if (!this.plugin.settings.flattenedStructure) { this.flattenedOptionsEl.hide(); return; }
    }
}
