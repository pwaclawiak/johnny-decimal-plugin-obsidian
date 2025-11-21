import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { JDFileAttributes} from './utils'
import {
    setLevel1Prefix, setLevel2Prefix, handleFolderFlattenedStructure,
    handleFileFlattenedStructure, removePrefixIfPresent
} from './jd-logic';
import { renameInProgress, renameQueue } from 'queuing';

interface JohnnyDecimalPluginSettings {
    divergeFromOriginalJD: boolean;
    flattenedStructure: boolean;
    foldersInFirstTen: boolean;
}

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
        //TODO: Idea - add command that adds new shelf level/category level folder to JDex (needs to store jdex location in settings)
        console.log('Loading Johnny Decimal Plugin - split version');
        await this.loadSettings();

        // expose plugin instance for subtree processor
        activePlugin = this;

        this.app.vault.on('rename', async (file, oldPath) => {

            // Skip handling if an ancestor path is under plugin subtree processing
            // if (isInProgress(stripJDIndexesFromPath(file.path))) return;

            // Check if file was moved to another folder - do not do anything on simple name change
            if (file.path.substring(0, file.path.lastIndexOf('/')) === oldPath.substring(0, oldPath.lastIndexOf('/'))) { return }

            const jdFile = new JDFileAttributes(file, oldPath);
            // console.log(file.name, renameInProgress);
            console.log(file.name, renameQueue);

            // File in root folder - remove prefix if present
            if (!file.parent || file.parent.path == "/") { 
                await removePrefixIfPresent(file, jdFile.hasJDprefix, jdFile.filePlainName);
                return;
            }

            //##################===================------------------- -------------------===================##################//
            //################================----------------  Handling files ----------------================################//
            //##################===================------------------- -------------------===================##################//
            if (file instanceof TFile) {
                // Files are leaf nodes that do not have prefixes unless using Flattened Structure setting
                // In that case files should only have prefixes if they are on level 2
                if (jdFile.parentHasTopLevelJDprefix()) { // Remove prefix for FILES in top-level JD folder
                    await removePrefixIfPresent(jdFile.file, jdFile.hasJDprefix, jdFile.filePlainName);
                    return;
                }
            
                if (!jdFile.parentHasJDprefix) { // Remove prefix if parent does not have one
                    await removePrefixIfPresent(jdFile.file, jdFile.hasJDprefix, jdFile.filePlainName);
                    return;
                }
            
                // Use file prefixes in flatten mode only
                if (this.settings.divergeFromOriginalJD && this.settings.flattenedStructure) {
                    await handleFileFlattenedStructure(jdFile);
                }
                return;
            }
            
            //##################===================------------------- -------------------===================##################//
            //################================--------------  Handling folders ---------------=================################//
            //##################===================------------------- -------------------===================##################//
            
            // Assert file instanceof TFolder
            // Remove prefix if parent does not have one
            // FIXME: w momencie wykonywania tego kodu (przy dodawaniu rename do kolejki) rodzic ma prefix 1 level
            // w międzyczasie wykonany zostaje job, który usuwa prefix rodzica
            // zakolejkowany został job ustawienia prefixu 2 poziomu dla dziecka i taki job się wykonuje
            // (następuje określanie docelowego prefixu poziomu drugiego, podczas gdy rodzic nie ma już prefixu
            // w związku z tym funkcja getParentJDprefix zwraca pusty string, do którego dopisana zostaje
            // część ID prefixu i w ostateczności nazwa folderu zaczyna się od kropki i zostaje ukryty)
            // trzeba zmienić sposób ustalania prefixu, albo jeszcze lepiej moment określania jaki job ma być wykonany
            // i kolejkować po prostu zmianę nazwy, a dopiero w trakcie wykonywania joba ustalać,
            // czy w ogóle ma być jakiś prefix, a jeśli tak, to który poziom i jaki prefix
            if (jdFile.getParentJDprefix() == '') {
                await removePrefixIfPresent(file, jdFile.hasJDprefix, jdFile.filePlainName);
                return;
            }

            // Parent is a top-level JD folder | 00-09
            if (jdFile.parentHasTopLevelJDprefix()) {
                await setLevel1Prefix(jdFile);
                // process immediate children after folder rename
                // if (file instanceof TFolder) await processFolderChildren(file, activePlugin);
                return;
            }
            
            // Parent has a regular JD prefix | 01
            if (jdFile.getParentJDprefixLevel() == 1) {
                // Flattened handling
                if (this.settings.divergeFromOriginalJD && this.settings.flattenedStructure) {
                    if (this.settings.foldersInFirstTen) {
                        await handleFolderFlattenedStructure(jdFile);
                        // process immediate children after folder rename
                        // if (file instanceof TFolder) await processFolderChildren(file, activePlugin);
                        return;
                    }
                    // If flattened but without folders in first 10, then remove prefix
                    await removePrefixIfPresent(file, jdFile.hasJDprefix, jdFile.filePlainName);
                    return;
                }

                // Standard (non-flattened): compute the new secondary prefix inside queued factory
                await setLevel2Prefix(jdFile);
                // process immediate children after folder rename
                // if (file instanceof TFolder) await processFolderChildren(file, activePlugin);
                return;
            }

            // Parent prefix level max depth - not adding prefix to folder | 01.11
            else { // (parentJDprefixLevel >= 2)
                await removePrefixIfPresent(file, jdFile.hasJDprefix, jdFile.filePlainName);
                return;
            }
        });

        this.addRibbonIcon('dice', 'Greet', () => {
            new Notice('Hello, world!');
        });

        // This creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (_evt: MouseEvent) => {
            // Called when the user clicks the icon.
            new Notice('This is a notice!');
        });
        // Perform additional things with the ribbon
        ribbonIconEl.addClass('my-plugin-ribbon-class');

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Status Bar Text');

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'open-sample-modal-simple',
            name: 'Open sample modal (simple)',
            callback: () => {
                new SampleModal(this.app).open();
            }
        });
        // This adds an editor command that can perform some operation on the current editor instance
        this.addCommand({
            id: 'sample-editor-command',
            name: 'Sample editor command',
            editorCallback: (editor: Editor, _view: MarkdownView) => {
                console.log(editor.getSelection());
                editor.replaceSelection('Sample Editor Command');
            }
        });
        // This adds a complex command that can check whether the current state of the app allows execution of the command
        this.addCommand({
            id: 'open-sample-modal-complex',
            name: 'Open sample modal (complex)',
            checkCallback: (checking: boolean) => {
                // Conditions to check
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    // If checking is true, we're simply "checking" if the command can be run.
                    // If checking is false, then we want to actually perform the operation.
                    if (!checking) {
                        new SampleModal(this.app).open();
                    }

                    // This command will only show up in Command Palette when the check function returns true
                    return true;
                }
            }
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new JDPluginSettingTab(this.app, this));

        // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
        //     console.log('click', evt);
        // });

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    onunload() {
        activePlugin = null;
        console.log('Unloading Johnny Decimal Plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SampleModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.setText('Woah!');
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

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
            .setDesc('Allow indexing subfolders with the first 10 IDs in category folders (e.g. |01 Me|). \
                These subfolders provide additional depth for further categorization on the same level \
                where *notes and regular files* reside.')
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
function sort() {
    throw new Error('Function not implemented.');
}

