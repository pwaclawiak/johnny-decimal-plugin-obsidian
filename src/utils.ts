import { TAbstractFile, TFolder, TFile, Notice } from 'obsidian';


/** *
 * 
 * @param fileName file/folder name
 * @returns true if JD prefix exists, false otherwise
 */
export function hasJDprefix(fileName: string): boolean {
    return (fileName.match(/^(\d{2}[-.]\d{2}|\d{2})\ \w+/)) ? true : false;
}

/**
 * 
 * @param fileName file/folder name
 * @returns JD prefix if exists, empty string otherwise
 */
export function getJDprefix(fileName: string): string {
    if (fileName.match(/^(\d{2}[-.]\d{2}|\d{2})\ \w+/)) {
        return fileName.substring(0, fileName.indexOf(' '));
    }
    return '';
}

/**
 * 
 * @param filePath file/folder path
 * @returns file name with JD prefix if exists
 */
export function getFileFolderName(filePath: string): string {
    return filePath.substring(filePath.lastIndexOf('/') + 1);
}

/**
 * 
 * @param filePath file/folder path
 * @returns file name without JD prefix
 */
export function getFileFolderPlainName(filePath: string): string {
    const fileName = getFileFolderName(filePath);
    return hasJDprefix(fileName) ? fileName.substring(fileName.indexOf(' ') + 1) : fileName;
}


/**
 * Strip any Johnny Decimal prefix from the target path string
 * @param path - full file/folder path (relative to vault root)  
 */
export function stripJDIndexesFromPath(path: string): string {
    if (!path) throw Error("stripJDIndexesFromPath: empty path");

    const parts = path.split('/');
    console.log(parts);
    for (let i = 0; i < parts.length; i++) {
        let new_parts = parts[i].replace(/^(\d{2}[-.]\d{2}|\d{2})\ (.*)$/, '$2');
        console.log(`Old part: ${parts[i]}, new part: ${new_parts}`);
        parts[i] = parts[i].replace(/^(\d{2}[-.]\d{2}|\d{2})\ (.*)$/, '$2');
    }
    console.log(parts.join('/'));
    return parts.join('/');
}

/**
 * Get the JD prefix level of a file/folder name (not its parent).
 * Returns: 0 for XX-YY prefix, 1 for XX prefix, 2 for XX.YY prefix, -1 for no prefix
 */
export function getJDprefixLevel(name: string): number {
    console.log(`Getting JD prefix level for name: ${name}`);
    if (name.match(/^\d{2}-\d{2} /)) return 0;  // Top-level area (e.g., "00-09 Area")
    if (name.match(/^\d{2} /)) return 1;         // Category (e.g., "01 Category")  
    if (name.match(/^\d{2}.\d{2} /)) return 2;  // ID (e.g., "01.01 Item")
    return -1;  // No JD prefix
}


export class JDFileAttributes {
    file: TAbstractFile
    oldName: string
    hasJDprefix: boolean
    fileJDprefix: string
    filePlainName: string
    JDprefixLevel: number

    constructor(file: TAbstractFile, oldPath: string) {
        this.file = file;
        this.oldName = oldPath.substring(oldPath.lastIndexOf("/") + 1)  // Old file name

        this.hasJDprefix = (this.oldName.match(/^\d{2}-\d{2} /) ||
            this.oldName.match(/^\d{2}.\d{2} /) ||
            this.oldName.match(/^\d{2} /)) ? true : false;
        this.fileJDprefix = this.hasJDprefix ? this.oldName.substring(0, this.oldName.indexOf(' ')) : "";
        this.filePlainName = this.hasJDprefix ? this.oldName.substring(this.oldName.indexOf(' ') + 1) : this.oldName;
        this.JDprefixLevel = getJDprefixLevel(this.oldName);
    }

    public parentHasTopLevelJDprefix():boolean {
        return this.file.parent?.name.match(/^\d{2}-\d{2} /) ? true : false;
    }

    public parentHasJDprefix():boolean {
        return this.file.parent?.name.match(/^\d{2}.\d{2} /) || this.file.parent?.name.match(/^\d{2} /) ? true : false;
    }

    public getParentJDprefix(): string {
        if (this.parentHasJDprefix() || this.parentHasTopLevelJDprefix()) {
            const parentIndexPart = this.file.parent ? this.file.parent.name.substring(0, this.file.parent.name.indexOf(' ')) : '';
            return parentIndexPart;
        }
        return ''
    }

    public getParentJDprefixLevel():number {
        return this.parentHasTopLevelJDprefix() ? 0 : (this.getParentJDprefix().match(/./g) || []).length + 1
    }

    public getParentPlainName(): string {
        return this.file.parent?.name.replace(/^(\d{2}[-.]\d{2}|\d{2})\ (.*)$/, '$2') || "";
    }
}

// --------------------------------- LEVEL 0 ---------------------------------

export function isLevel0PrefixAvailable(file: TAbstractFile): boolean {
    const siblings = file.parent?.children || [];
    const siblingPrefixes = siblings
        .filter(sibling => sibling.name !== file.name)
        .filter(sibling => sibling instanceof TFolder)
        .map(sibling => sibling.name.match(/^\d{2}-\d{2} /))
        .filter(matched => matched !== null)
        .sort()
        .map(matched => matched[0].substring(0, matched[0].indexOf(' ')));

    const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('-') + 1));
    if (usedPrefixNumbers.includes(getJDprefix(file.name).substring(3,6))) {
        return false;
    }
    return true;
}

// --------------------------------- LEVEL 1 ---------------------------------

function moveToLevel1PrefixedName(file: TAbstractFile, jdFile: JDFileAttributes): string {
    // jeśli przeniesiony, to dostaje nowy prefix i tyle
    const siblings = file.parent?.children || [];
    const siblingPrefixes = siblings
        .filter(sibling => sibling.name !== file.name)
        .filter(sibling => sibling instanceof TFolder)
        .map(sibling => sibling.name.match(/^\d{2} /) )// || sibling.name.match(/^\d{2}.\d{2} /))
        .filter(matched => matched !== null)
        .sort()
        .map(matched => matched[0].substring(0, matched[0].indexOf(' ')));
    
    const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));
    const newPrefixNumber = Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1 || 1;
    
    // Top level folder full - do not add prefix
    if (newPrefixNumber.toString() > jdFile.getParentJDprefix().substring(4)) {
        new Notice("There is no more space for additional categories in this area!");
        return jdFile.filePlainName;
    }

    const newPrefix = newPrefixNumber.toString().padStart(2, jdFile.getParentJDprefix()[0]);
    if (!jdFile.hasJDprefix || (jdFile.fileJDprefix !== newPrefix)) {
        let newPrefixedName = newPrefix + " " + jdFile.filePlainName;
        return newPrefixedName;
    }

    return jdFile.oldName;
}

function level1ParentChangedGetPrefixedName(jdFile: JDFileAttributes, oldParentPath: string, newParentName:string): string {
    // If parent was moved or changed its prefix, update only the inherited part
    // If parent only changed NAME, do nothing
    
    // Parent name has changed, but prefix remains the same
    const oldParentPrefix = getJDprefix(getFileFolderName(oldParentPath));
    const newParentPrefix = getJDprefix(newParentName);
    if (oldParentPrefix === newParentPrefix) return jdFile.oldName;

    // Parent prefix has changed
    if (jdFile.hasJDprefix && getJDprefixLevel(jdFile.oldName) === 1) {
        const newPrefix = newParentPrefix[0] + jdFile.fileJDprefix[1];
        return newPrefix + " " + jdFile.filePlainName;
    } else { // Already in the folder, but did not have prefix before (unprefixed folder or purposeful action)
        return jdFile.oldName;
    }
}

export function getLevel1PrefixFolderName(file: TAbstractFile, jdFile: JDFileAttributes, oldPath: string, oldParentPath: string, newParentName: string, fileMoved: boolean): string {
    if (!file.parent) return jdFile.oldName;  // There should always be a parent on level 1
    if (fileMoved) {
        return moveToLevel1PrefixedName(file, jdFile);
    } else if (getFileFolderName(oldParentPath) !== getFileFolderName(file.parent.name)) {
        return level1ParentChangedGetPrefixedName(jdFile, oldParentPath, newParentName);
    } else if (oldParentPath !== file.parent.path) {
        return jdFile.oldName;
    } else {
        return renamedFilePrefixedName(jdFile, oldPath);
    }
}

// --------------------------------- LEVEL 2 ---------------------------------

function moveToLevel2PrefixedName(file: TAbstractFile, jdFile: JDFileAttributes): string {
    if (!file.parent) return jdFile.filePlainName;

    const siblings = file.parent.children;
    const siblingPrefixes = siblings
        .filter(sibling => sibling.name !== file.name)
        .filter(sibling => sibling instanceof TFolder)
        .map(sibling => sibling.name.match(/^\d{2} /) || sibling.name.match(/^\d{2}.\d{2} /))
        .filter(matched => matched !== null)
        .sort()
        .map(matched => matched[0].substring(0, matched[0].indexOf(' ')));

    const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));
    const newPrefixNumber = Math.max(Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1, 11) || 11;
    const newPrefixedName = jdFile.getParentJDprefix() + "." + newPrefixNumber + " " + jdFile.filePlainName;
    return newPrefixedName;
}

function renamedFilePrefixedName(jdFile: JDFileAttributes, oldPath: string): string {
    // It is assumed this function is called only when direct rename happened
    const parentPrefix = jdFile.getParentJDprefix();
    const parentPrefixLevel = jdFile.getParentJDprefixLevel();
    const prefixLevel = getJDprefixLevel(jdFile.oldName);
    const oldFileName = getFileFolderName(oldPath);
    if (prefixLevel === parentPrefixLevel + 1 && jdFile.fileJDprefix.substring(0, prefixLevel) !== parentPrefix.substring(0, prefixLevel)) {
        new Notice(`The prefix ${getJDprefix(jdFile.oldName)} does not match the parent's prefix - reverting the change.`);
        return oldFileName;
    }
    return jdFile.oldName;
}

function level2ParentChangedGetPrefixedName(jdFile: JDFileAttributes, oldParentPath: string, newParentName: string): string {
    const oldParentPrefix = getJDprefix(getFileFolderName(oldParentPath));
    const newParentPrefix = getJDprefix(newParentName);
    if (oldParentPrefix === newParentPrefix) return jdFile.oldName;

    // Parent prefix has changed
    if (jdFile.hasJDprefix && getJDprefixLevel(jdFile.oldName) === 2) {
        const newPrefix = newParentPrefix + jdFile.fileJDprefix.substring(newParentPrefix.length);
        return newPrefix + " " + jdFile.filePlainName;
    }
    // Already in the folder, but did not have prefix before (unprefixed folder or purposeful action)
    return jdFile.oldName;
}

export function getLevel2PrefixFolderName(file: TAbstractFile, jdFile: JDFileAttributes, oldPath: string, oldParentPath: string, newParentName: string, fileMoved: boolean): string {
    if (!file.parent) return jdFile.oldName;  // There should always be a parent on level 1
    if (fileMoved) {
        return moveToLevel2PrefixedName(file, jdFile);
    } else if (getFileFolderName(oldParentPath) !== getFileFolderName(newParentName)) {
        return level2ParentChangedGetPrefixedName(jdFile, oldParentPath, newParentName);
    } else if (oldParentPath !== file.parent.path) {
        return jdFile.oldName;
    } else {
        return renamedFilePrefixedName(jdFile, oldPath);
    }
}

// --------------------------- FLATTENED STRUCTURE ---------------------------

export function getFileNameFlattened(file: TAbstractFile, jdFile: JDFileAttributes, oldParentPath: string, newParentName: string, fileMoved: boolean): string {
    if (!file.parent) return jdFile.oldName;
    if (!fileMoved) {
        // Parent changed
        
        // Case 1a: only parent -NAME- has changed
        if (getFileFolderPlainName(oldParentPath) !== getFileFolderPlainName(newParentName)) {
            return file.name;
        }
        
        // Case 1b: parent PREFIX changed
        if (getJDprefix(oldParentPath) !== getJDprefix(newParentName)) {
            // Parent prefix level other than 1 - no action
            const parentPrefixLevel = getJDprefixLevel(newParentName);
            if (parentPrefixLevel !== 1) return file.name;
            
            // File has no prefix - no action
            if (!hasJDprefix(file.name)) return file.name;
            
            // File has prefix other than level_2 - no action
            if (getJDprefixLevel(file.name) !== 2) return file.name;
            
            // File has a level_2 prefix - update the prefix to match new parent prefix
            const newParentPrefix = getJDprefix(newParentName);
            const newPrefix = newParentPrefix + jdFile.fileJDprefix.substring(newParentPrefix.length);
            return newPrefix + " " + jdFile.filePlainName;
        }
        // Case 2: direct manual rename
        return renamedFilePrefixedName(jdFile, oldParentPath);
    }
    return getNewFileNameFlattened(file, jdFile);
}

function getNewFileNameFlattened(file: TAbstractFile, jdFile: JDFileAttributes): string {
    if (!file.parent) return jdFile.oldName;
    if (jdFile.getParentJDprefixLevel() !== 1) return jdFile.oldName;

    const prefixRegex = RegExp(`^${jdFile.getParentJDprefix()}.\\d{2} `);

    if (jdFile.getParentJDprefixLevel() == 1 && (!jdFile.hasJDprefix
        || !jdFile.fileJDprefix.match(prefixRegex)))
    {
        const siblings = file.parent.children;
        const siblingPrefixes = siblings
            .filter(sibling => sibling.name !== file.name)
            .filter(sibling => sibling instanceof TFile)
            .map(sibling => sibling.name.match(prefixRegex))
            .filter(matched => matched !== null)
            .sort()
            .map(matched => matched[0].substring(0, matched[0].indexOf(' ')));
        const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));
        const newPrefixNumber = Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1 || 11;
        return jdFile.getParentJDprefix() + "." + newPrefixNumber.toString() + " " + jdFile.filePlainName;
    }

    return file.name;
}

export function getFolderNameFlattened(file: TAbstractFile, jdFile: JDFileAttributes, foldersInFirstTen: boolean): string {
    if (!file.parent) return jdFile.filePlainName;
    if (!(foldersInFirstTen && jdFile.getParentJDprefixLevel() === 1)) return jdFile.filePlainName;

    let first10prefixes = [...Array(10).keys()].map(num => (num + 1).toString().padStart(2, "0"));

    const siblings = file.parent.children;
    const siblingPrefixes = siblings
        .filter(sibling => sibling.name !== file.name)
        .filter(sibling => sibling instanceof TFolder)
        .map(sibling => (sibling.name.match(/^\d{2} /) || sibling.name.match(/^\d{2}.\d{2} /)))
        .filter(matched => matched !== null)
        .sort()
        .map(matched => matched[0].substring(0, matched[0].indexOf(' ')));

    const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));

    // Top level folder full - do not add prefix
    if (first10prefixes.every(prefix => usedPrefixNumbers.includes(prefix))) {
        new Notice("All first 10 prefixes are occupied!");
        return jdFile.filePlainName;
    }

    let newPrefixNumber = first10prefixes.filter(val => !usedPrefixNumbers.includes(val))[0];
    let prefixIDpart = newPrefixNumber.toString().padStart(2, jdFile.getParentJDprefix()[0]);

    if (!jdFile.hasJDprefix || (jdFile.fileJDprefix !== jdFile.getParentJDprefix() + "." + prefixIDpart)) {
        let newPrefixedName = jdFile.getParentJDprefix() + "." + prefixIDpart + " " + jdFile.filePlainName;
        return newPrefixedName;
    }

    return file.name;
}
