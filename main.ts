import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFolder } from 'obsidian';


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

export default class JohnnyDecimalPlugin extends Plugin {
	settings: JohnnyDecimalPluginSettings;

	async onload() {
		//TODO: Idea - add command that adds new shelf level/category level folder to JDex (needs to store jdex location in settings)
		console.log('Loading Johnny Decimal Plugin');
		await this.loadSettings();

		function removePrefixIfPresent(file:TAbstractFile, hasJDprefix: boolean, filePlainName:string): void {
			const vault = file.vault;
			if (hasJDprefix && file.parent) {
				vault.rename(file, file.parent.path + "/" + filePlainName);
			}
		}

		// TODO: Execute this function when folder moves to different parent or only changes its name
		function updateChildrenPrefix(thisFolder:TFolder, newFolderPrefix:string): Number {
			let filesChanged = 0;

			if (!thisFolder.children.length) { // Does not contain anything
				return 0;
			}

			let parentHasTopLevelJDprefix = newFolderPrefix.match(/^\d{2}\-\d{2} /)

			thisFolder.children.forEach(child => {
				let hasJDprefix = (child.name.match(/^\d{2}\.\d{2} /) || child.name.match(/^\d{2} /)) ? true : false;
				let parentJDprefixLevel = parentHasTopLevelJDprefix ? 0 : (newFolderPrefix.match(/\./g) || []).length + 1;
				let prefix = child.name.split(" ")[0]

				if (!hasJDprefix) { // no prefix - add a new one
					// TODO: do not add prefixes - either only when setting on or on command call
				}

				// let newPrefix = prefix.split("-").map(str => str[1].padStart(2, newFolderPrefix[0])).join("-");
				if (parentJDprefixLevel == 0) { // level 0
					let newPrefix = prefix[1].padStart(2, newFolderPrefix[0])
					thisFolder.vault.rename(child, newPrefix + " " + child.name.split(" ")[1])
				} else if (parentJDprefixLevel == 1) { // level 1
					// let newPrefix = prefix[
				} else { // level >= 2

				}

				

				// 00-09
				// 01
				// 01.11
			})

			return filesChanged;
		}
		
		this.app.vault.on('rename', (file, oldPath) => {
			// Check if file was moved to another folder - othwerwise do nothing
			if (file.path.substring(0, file.path.lastIndexOf('/')) === oldPath.substring(0, oldPath.lastIndexOf('/'))) { return }

			// TODO: Make sure to only rename when the file has no prefix or has one that's different than desired
			let hasJDprefix = (file.name.match(/^\d{2}\.\d{2} /) || file.name.match(/^\d{2} /)) ? true : false;
			let fileJDprefix = hasJDprefix ? file.name.substring(0, file.name.indexOf(' ')) : null;
			let filePlainName = hasJDprefix ? file.name.substring(file.name.indexOf(' ') + 1) : file.name;
			
			if (!file.parent || file.parent.path == "/") { // File in root folder - remove prefix if present
				if (hasJDprefix) {
					this.app.vault.rename(file, filePlainName);
				}
				return;
			}

			let parentHasTopLevelJDprefix = file.parent.name.match(/^\d{2}\-\d{2} /)
			let parentHasJDprefix = file.parent.name.match(/^\d{2}\.\d{2} /) || file.parent.name.match(/^\d{2} /);
			let parentJDprefix = (parentHasJDprefix || parentHasTopLevelJDprefix) ? 
				file.parent.name.substring(0, file.parent.name.indexOf(' ')) : '';
			let parentJDprefixLevel = parentHasTopLevelJDprefix ? 0 : (parentJDprefix.match(/\./g) || []).length + 1;

			// Handling folders
			if (!file.hasOwnProperty('extension')) {
				console.log(file);
				if (!parentHasJDprefix && !parentHasTopLevelJDprefix) { // Remove prefix if parent does not have one
					removePrefixIfPresent(file, hasJDprefix, filePlainName);
					return;
				}

				let siblings = file.parent.children;
				let siblingPrefixes = siblings
					.filter(sibling => sibling.name !== file.name)
					.filter(sibling => !sibling.hasOwnProperty('extension'))
					.map(sibling => sibling.name.match(/^\d{2} /) || sibling.name.match(/^\d{2}\.\d{2} /))
					.filter(matched => matched !== null)
					.sort()
					.map(matched => matched[0].substring(0, matched[0].indexOf(' ')));
				
				console.log(siblingPrefixes);
				let usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));

				if (parentHasTopLevelJDprefix) { // Parent is a top-level JD folder
					let newPrefixNumber = Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1 || 1;

					if (newPrefixNumber > 9) { // Top level folder full - do not add prefix
						new Notice("There is no more space for additional categories in this folder!");
						removePrefixIfPresent(file, hasJDprefix, filePlainName);
						return;
					}

					if (!hasJDprefix || (fileJDprefix !== parentJDprefix[0]+String(newPrefixNumber))) { // Add or update prefix
						let newPrefixedName = newPrefixNumber.toString().padStart(2, parentJDprefix[0]) + " " + filePlainName;
						this.app.vault.rename(file, file.parent.path + "/" + newPrefixedName);
						return;
					}
					return;
				}
				
				if (parentJDprefixLevel == 1) { // Parent has a regular JD prefix
					if (this.settings.divergeFromOriginalJD && this.settings.flattenedStructure) {
						if (this.settings.foldersInFirstTen) {
							let first10prefixes = [...Array(10).keys()].map(num => (num+1).toString().padStart(2, "0"));
							if (first10prefixes.every(pref => usedPrefixNumbers.contains(pref))) { // Top level folder full - do not add prefix
								new Notice("All first 10 prefixes are occupied!");
								removePrefixIfPresent(file, hasJDprefix, filePlainName);
								return;
							}

							let newPrefixNumber = first10prefixes.filter(val => !usedPrefixNumbers.contains(val))[0];
							let prefixIDpart = newPrefixNumber.toString().padStart(2, parentJDprefix[0])
							if (!hasJDprefix || (fileJDprefix !== parentJDprefix + "." + prefixIDpart)) { // Add or update prefix
								let newPrefixedName = parentJDprefix + "." + prefixIDpart + " " + filePlainName;
								this.app.vault.rename(file, file.parent.path + "/" + newPrefixedName);
								return;
							}
						}

						// If flattened but without folders in first 10, then remove prefix
						removePrefixIfPresent(file, hasJDprefix, filePlainName);
						return;
					}
					
					// Set prefix if structure not flattened
					if (!hasJDprefix || (fileJDprefix !== parentJDprefix)) { // Add or update prefix
						let newPrefixNumber = Math.max(Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1, 11) || 11;
						let newPrefixedName = parentJDprefix + "." + newPrefixNumber + " " + filePlainName;
						this.app.vault.rename(file, file.parent.path + "/" + newPrefixedName);
						return;
					}
					// TODO: Dodać zmianę prefiksu w nazwach plików/podfolderów w folderze przy przenoszeniu folderu
					return;
				}

				if (parentJDprefixLevel >= 2) { // Parent prefix level high - not adding prefix to folder
					removePrefixIfPresent(file, hasJDprefix, filePlainName);
					return;
				}
				return;
			}

			// Handling files
			if (parentHasTopLevelJDprefix) { // Remove prefix for FILES in top-level JD folder
				removePrefixIfPresent(file, hasJDprefix, filePlainName);
				return
			}

			if (!parentHasJDprefix) { // Remove prefix if parent does not have one
				removePrefixIfPresent(file, hasJDprefix, filePlainName);
				return;
			}
			
			if (!hasJDprefix || (fileJDprefix !== parentJDprefix)) { // Add or update prefix
				let newPrefixedName = parentJDprefix + " " + filePlainName;
				this.app.vault.rename(file, file.parent.path + "/" + newPrefixedName);
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
				standard where notes and files reside.')
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
