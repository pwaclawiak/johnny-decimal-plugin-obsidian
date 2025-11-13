import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TagCache, TFile, TFolder } from 'obsidian';


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

// --- added: per-parent queue + safe rename helpers ---
const renameQueues: Map<string, Promise<void>> = new Map();

/**
 * Enqueue an async operation for a parent path so operations touching the same parent serialize.
 */
function enqueueParentOp(parentPath: string, op: () => Promise<void>): Promise<void> {
    const prev = renameQueues.get(parentPath) ?? Promise.resolve();
    const next = prev.then(() => op()).catch((e) => {
        // swallow to keep queue moving; caller can handle errors via returned promise if needed
        console.error("enqueueParentOp error:", e);
    });
    renameQueues.set(parentPath, next);
    next.finally(() => {
        // clear entry if no newer promise
        if (renameQueues.get(parentPath) === next) renameQueues.delete(parentPath);
    });
    return next;
}

/**
 * Try to rename safely: re-resolve the file if needed and retry a few times
 * to avoid "file does not exist" errors when parent folders are being moved.
 *
 * newNameOrFactory: a function that is evaluated each attempt so sibling
 * prefixes can be recomputed on each retry.
 */
type NameFactory = string | ((file: TAbstractFile) => Promise<string> | string);

async function safeRename(vault: any, file: TAbstractFile, newNameOrFactory: NameFactory, maxRetries = 3): Promise<void> {
    let attempt = 0;
    let lastErr: any = null;
    while (attempt < maxRetries) {
        // re-resolve current file reference
        const resolved = vault.getAbstractFileByPath(file.path) || file;
        file = resolved;

        // Compute current parent path from the file's current path (safer than using file.parent)
        const currentPath = file.path || "";
        const parentSepIndex = currentPath.lastIndexOf("/");
        const currentParentPath = parentSepIndex >= 0 ? currentPath.substring(0, parentSepIndex) : "";
        
		let evaluatedName: string = file.name;
        try {
            if (typeof newNameOrFactory === "function") {
                evaluatedName = await (newNameOrFactory as ((f: TAbstractFile) => Promise<string> | string))(file);
            } else {
                evaluatedName = newNameOrFactory;
            }
        } catch (e) {
            lastErr = e;
		}
		
		const newPath = (currentParentPath === "" ? "" : currentParentPath + "/") + evaluatedName;

        try {
            await vault.rename(file, newPath);
            return;
        } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 120));
            attempt++;
        }
    }
    throw lastErr;
}


// Enqueued rename that serializes by parent path and uses safeRename.
function enqueueRename(vault: any, file: TAbstractFile, newNameOrFactory: NameFactory): Promise<void> {
    const parentPath = file.parent ? file.parent.path : "";
    return enqueueParentOp(parentPath, () => safeRename(vault, file, newNameOrFactory));
}



async function removePrefixIfPresent(file:TAbstractFile, hasJDprefix: boolean, filePlainName:string): Promise<void> {
    // console.log(file.name + " - before error")

    const vault = file.vault;
    if (hasJDprefix && file.parent) {
        await enqueueRename(vault, file, filePlainName);
    }
    // console.log("Change completed successfully.")
}

async function handleFlattenedStructure(
    file: TAbstractFile,
    hasJDprefix: boolean,
    fileJDprefix: string | null,
    filePlainName: string,
    parentJDprefix: string,
): Promise<void> {
    const vault = file.vault;

    // compute currently-used sibling prefixes at the time the queued op runs
    await enqueueRename(vault, file, async (f: TAbstractFile) => {
        if (!f.parent) return filePlainName;

        let first10prefixes = [...Array(10).keys()].map(num => (num + 1).toString().padStart(2, "0"));

        const siblings = f.parent.children;
        const siblingPrefixes = siblings
            .filter(sibling => sibling.name !== f.name)
            .filter(sibling => sibling instanceof TFolder)
            .map(sibling => (sibling.name.match(/^\d{2}\.\d{2} /) || sibling.name.match(/^\d{2} /)))
            .filter(matched => matched !== null)
            .sort()
            .map(matched => matched![0].substring(0, matched![0].indexOf(' ')));

        const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));

        // Top level folder full - do not add prefix
        if (first10prefixes.every(pref => usedPrefixNumbers.includes(pref))) {
            new Notice("All first 10 prefixes are occupied!");
            return filePlainName;
        }

        let newPrefixNumber = first10prefixes.filter(val => !usedPrefixNumbers.includes(val))[0];
        let prefixIDpart = newPrefixNumber.toString().padStart(2, parentJDprefix[0]);

        // Add or update prefix
        if (!hasJDprefix || (fileJDprefix !== parentJDprefix + "." + prefixIDpart)) {
            let newPrefixedName = parentJDprefix + "." + prefixIDpart + " " + filePlainName;
            return newPrefixedName;
        }

        return f.name;
    });
    return;
}

async function setLevel1Prefix(file: TAbstractFile, filePlainName: string, newPrefixNumber: number, parentJDprefix: string): Promise<string> {
    const vault = file.vault;

    if (!file.parent) {
        throw Error("Structure error - expected a parent directory but found none.")
    }

    let newPrefixedName = newPrefixNumber.toString().padStart(2, parentJDprefix[0]) + " " + filePlainName;
    console.log(`Rename: ${file.path} --> ${file.parent.path + "/" + newPrefixedName}`)
    await enqueueRename(vault, file, newPrefixedName);

    return newPrefixedName
}

async function setLevel2Prefix(file: TAbstractFile, filePlainName: string, usedPrefixNumbers: Array<string>, parentJDprefix: string,): Promise<string> {
    const vault = file.vault;

    if (!file.parent) {
        throw Error("Structure error - expected a parent directory but found none.")
    }

    let newPrefixNumber = Math.max(Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1, 11) || 11;
    let newPrefixedName = parentJDprefix + "." + newPrefixNumber + " " + filePlainName;
    console.log(`Rename: ${file.path} --> ${file.parent.path + "/" + newPrefixedName}`)
    await enqueueRename(vault, file, newPrefixedName);

    return newPrefixedName
}

export default class JohnnyDecimalPlugin extends Plugin {
	settings: JohnnyDecimalPluginSettings;

	async onload() {
		//TODO: Idea - add command that adds new shelf level/category level folder to JDex (needs to store jdex location in settings)
		console.log('Loading Johnny Decimal Plugin');
		await this.loadSettings();

		// TODO: Execute this function when folder moves to different parent or only changes its name
		// function updateChildrenPrefix(thisFolder:TFolder, newFolderPrefix:string): Number {
		// 	let filesChanged = 0;

		// 	if (!thisFolder.children.length) { // Does not contain anything
		// 		return 0;
		// 	}

		// 	let parentHasTopLevelJDprefix = newFolderPrefix.match(/^\d{2}\-\d{2} /)

		// 	thisFolder.children.forEach(child => {
		// 		let hasJDprefix = (child.name.match(/^\d{2}\.\d{2} /) || child.name.match(/^\d{2} /)) ? true : false;
		// 		let parentJDprefixLevel = parentHasTopLevelJDprefix ? 0 : (newFolderPrefix.match(/\./g) || []).length + 1;
		// 		let prefix = child.name.split(" ")[0]

		// 		if (!hasJDprefix) { // no prefix - add a new one
		// 			// TODO: do not add prefixes - either only when setting on or on command call
		// 		}

		// 		// let newPrefix = prefix.split("-").map(str => str[1].padStart(2, newFolderPrefix[0])).join("-");
		// 		if (parentJDprefixLevel == 0) { // level 0
		// 			let newPrefix = prefix[1].padStart(2, newFolderPrefix[0])
		// 			thisFolder.vault.rename(child, newPrefix + " " + child.name.split(" ")[1])
		// 		} else if (parentJDprefixLevel == 1) { // level 1
		// 			// let newPrefix = prefix[
		// 		} else { // level >= 2

		// 		}

				

		// 		// 00-09
		// 		// 01
		// 		// 01.11
		// 	})

		// 	return filesChanged;
		// }
		
		this.app.vault.on('rename', async (file, oldPath) => {


			// FIXME: MAJOR ISSUE - find a way to synchronously change the names - currently all children get renamed
			// but they all get the same prefix (probably happens concurently and they do not see the updated list of siblings prefixes)


			// 
			// TODO: jeśli nazwa rodzica się nie zmienia, ale zmienia się jego ścieżka, to nic nie robić i zmiany nazwy przeprowadzić rekurencyjnie (czy to na pewno dobry pomysł???)

			// FIXME: kiedy zmienia się tylko nazwa pliku, zamiast nic nie robić, trzeba zmienić wszystkie dzieci

			// TODO: może spróbować jakąś zmienną globalną / fabrykę, która pomoże w indeksowaniu dzieci w obrębie folderu, żeby nie miały wszystkie takiego samego ID

			// TODO: Fix bug (or accept as feature) where moving folder inside level one folder does not occupy gaps and takes new, higher prefix instead
			// If changing to occupy gaps (maybe use it as option in settings) show a notice that the folder filled a gap and show its new name

			console.log(file);

			// Check if file was moved to another folder - do not do anything on simple name change
			if (file.path.substring(0, file.path.lastIndexOf('/')) === oldPath.substring(0, oldPath.lastIndexOf('/'))) { return }
			
			const fileName = oldPath.substring(oldPath.lastIndexOf("/") + 1)  // Old file name
			const hasJDprefix = (fileName.match(/^\d{2}\-\d{2} /) ||
				fileName.match(/^\d{2}\.\d{2} /) ||
				fileName.match(/^\d{2} /)) ? true : false;
			const fileJDprefix = hasJDprefix ? fileName.substring(0, fileName.indexOf(' ')) : null;
			const filePlainName = hasJDprefix ? fileName.substring(fileName.indexOf(' ') + 1) : fileName;

			// File in root folder - remove prefix if present
			if (!file.parent || file.parent.path == "/") { 
				await removePrefixIfPresent(file, hasJDprefix, filePlainName);
				return;
			}

			// Parent folder from the oldPath does not exist anymore, so parent folder must have been changed, so do nothing to prevent error
			// if (this.app.vault.getAbstractFileByPath(oldPath.substring(0, oldPath.lastIndexOf("/"))) === null) { return; }
			// TODO: TODO: try this with renaming recursively on my own, instead of the default system; (is the performance going to be significantly lower???)

			// Parent folder moved/changed name - file reference outdated, so do nothing
			// if (!oldPath.contains(file.parent.path)) { return }


			let parentHasTopLevelJDprefix = file.parent.name.match(/^\d{2}\-\d{2} /)
			let parentHasJDprefix = file.parent.name.match(/^\d{2}\.\d{2} /) || file.parent.name.match(/^\d{2} /);
			let parentJDprefix = (parentHasJDprefix || parentHasTopLevelJDprefix) ? 
				file.parent.name.substring(0, file.parent.name.indexOf(' ')) : '';
			let parentJDprefixLevel = parentHasTopLevelJDprefix ? 0 : (parentJDprefix.match(/\./g) || []).length + 1;


			
			//##################===================------------------- -------------------===================##################//
			//################================----------------  Handling files ----------------================################//
			//##################===================------------------- -------------------===================##################//
			
			if (file instanceof TFile) {
				// Files are leaf nodes that do not have prefixes unless using Flattened Structure setting
				// In that case files should only have prefixes if they are on level 2

				// console.log("Handling files not fully supported yet!")
				//TODO: implement functionalities

				if (parentHasTopLevelJDprefix) { // Remove prefix for FILES in top-level JD folder
					await removePrefixIfPresent(file, hasJDprefix, filePlainName);
					return
				}

				if (!parentHasJDprefix) { // Remove prefix if parent does not have one
					await removePrefixIfPresent(file, hasJDprefix, filePlainName);
					return;
				}

			//##################===================------------------- -------------------===================##################//
			//###############===============---------------  Flattened structure ---------------===============################//
			//##################===================------------------- -------------------===================##################//

				// Use prefixes in flatten mode only
				// TODO: block adding IDs to folders 01.01 in flatten with folders in first ten slots
				if (this.settings.divergeFromOriginalJD && this.settings.flattenedStructure) {
                    if (parentJDprefixLevel < 2 && (!hasJDprefix || !fileJDprefix?.match(RegExp(`^${parentJDprefix}.\\d{2}`)))) {
                        // compute prefix inside queued factory so siblings are read in serialized order
                        await enqueueRename(this.app.vault, file, async (f: TAbstractFile) => {
                            if (!f.parent) return filePlainName;
                            let siblings = f.parent.children;
                            let siblingPrefixes = siblings
                                .filter(sibling => sibling.name !== f.name)
                                .filter(sibling => sibling instanceof TFile)
                                .map(sibling => sibling.name.match(/^\d{2}\.\d{2} /))
                                .filter(matched => matched !== null)
                                .sort()
                                .map(matched => matched![0].substring(0, matched![0].indexOf(' ')));
                            
                            let usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));
                            let newPrefixNumber = Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1 || 11;
                            return parentJDprefix + "." + newPrefixNumber.toString() + " " + filePlainName;
                        });
                        return;
                    }
                }
                return
            }
			

			//##################===================------------------- -------------------===================##################//
			//################================---------------  Handling folders ---------------================################//
			//##################===================------------------- -------------------===================##################//
			
			// Assert file instanceof TFolder
			// console.log(file);
			// Remove prefix if parent does not have one
			if (!parentHasJDprefix && !parentHasTopLevelJDprefix) {
				await removePrefixIfPresent(file, hasJDprefix, filePlainName);
				return;
			}

			// Catch if the prefix already is correct to avoid errors from children (they are renamed (path change) on parent name change)
			// if (
			// 	(!hasJDprefix && !parentHasJDprefix) ||
			// 	(parentHasTopLevelJDprefix && fileJDprefix?.match(RegExp(`^${parentJDprefix[0]}\\d`))) ||
			// 	(parentHasJDprefix && fileJDprefix?.match(RegExp(`^${parentJDprefix}.\\d{2}`)))) {
			// 	return;
			// }
			// TODO: Catch early if folder has a prefix that is OK
			// Important in case of moving folder that contains other folders


			//##################===================------------------- -------------------===================##################//
			//################================---------------  Handling folders ---------------================################//
			//##################===================------------------- -------------------===================##################//
			// compute siblingPrefixes (but don't compute final usedPrefixNumbers here --
			// final computation must happen inside queued factories)


			// Parent is a top-level JD folder | 00-09
            if (parentHasTopLevelJDprefix) {
                // compute new prefix inside queued factory
                await enqueueRename(this.app.vault, file, async (f: TAbstractFile) => {
                    if (!f.parent) return filePlainName;

					const siblings = f.parent.children;
					const siblingPrefixes = siblings
						.filter(sibling => sibling.name !== file.name)
						.filter(sibling => sibling instanceof TFolder)
						.map(sibling => sibling.name.match(/^\d{2} /) || sibling.name.match(/^\d{2}\.\d{2} /))
						.filter(matched => matched !== null)
						.sort()
						.map(matched => matched[0].substring(0, matched[0].indexOf(' ')));

                    const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));
                    const newPrefixNumber = Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1 || 1;

                    // Top level folder full - do not add prefix
                    if (newPrefixNumber.toString() > parentJDprefix.substring(4)) { 
                        new Notice("There is no more space for additional categories in this folder!");
                        return filePlainName;
                    }

					// Add or update prefix
                    if (!hasJDprefix || (fileJDprefix !== parentJDprefix[0] + String(newPrefixNumber))) {
                        let newPrefixedName = newPrefixNumber.toString().padStart(2, parentJDprefix[0]) + " " + filePlainName;
                        return newPrefixedName;
                    }
                    return f.name;
                });
                return;
            }
            
            // Parent has a regular JD prefix | 01
            else if (parentJDprefixLevel == 1) {
                // Flattened handling
                if (this.settings.divergeFromOriginalJD && this.settings.flattenedStructure) {
                    if (this.settings.foldersInFirstTen) {
                        await handleFlattenedStructure(file, hasJDprefix, fileJDprefix, filePlainName, parentJDprefix);
                        return;
                    }
                    // If flattened but without folders in first 10, then remove prefix
                    await removePrefixIfPresent(file, hasJDprefix, filePlainName);
                    return;
                }
                
                // Standard (non-flattened): compute the new secondary prefix inside queued factory
                await enqueueRename(this.app.vault, file, async (f: TAbstractFile) => {
                    if (!f.parent) return filePlainName;

					const siblings = f.parent.children;
					const siblingPrefixes = siblings
						.filter(sibling => sibling.name !== file.name)
						.filter(sibling => sibling instanceof TFolder)
						.map(sibling => sibling.name.match(/^\d{2} /) || sibling.name.match(/^\d{2}\.\d{2} /))
						.filter(matched => matched !== null)
						.sort()
						.map(matched => matched[0].substring(0, matched[0].indexOf(' ')));

                    const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));
                    const newPrefixNumber = Math.max(Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1, 11) || 11;
                    const newPrefixedName = parentJDprefix + "." + newPrefixNumber + " " + filePlainName;
                    return newPrefixedName;
                });
                return;
            }

			// Parent prefix level max depth - not adding prefix to folder | 01.11
			else { // (parentJDprefixLevel >= 2)
				await removePrefixIfPresent(file, hasJDprefix, filePlainName);
				return;
			}

			return;
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
		// 	console.log('click', evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {
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
