
import { TAbstractFile, TFolder, TFile, Notice } from 'obsidian';


export class JDFileAttributes {
    file: TAbstractFile
    fileName: string
    hasJDprefix: boolean
    fileJDprefix: string
    filePlainName: string

    constructor(file: TAbstractFile, oldPath: string) {
        this.file = file;
        this.fileName = oldPath.substring(oldPath.lastIndexOf("/") + 1)  // Old file name

        this.hasJDprefix = (this.fileName.match(/^\d{2}\-\d{2} /) ||
            this.fileName.match(/^\d{2}\.\d{2} /) ||
            this.fileName.match(/^\d{2} /)) ? true : false;
        this.fileJDprefix = this.hasJDprefix ? this.fileName.substring(0, this.fileName.indexOf(' ')) : "";
        this.filePlainName = this.hasJDprefix ? this.fileName.substring(this.fileName.indexOf(' ') + 1) : this.fileName;
    }

    public parentHasTopLevelJDprefix():boolean {
        return this.file.parent?.name.match(/^\d{2}\-\d{2} /) ? true : false;
    }

    public parentHasJDprefix():boolean {
        return this.file.parent?.name.match(/^\d{2}\.\d{2} /) || this.file.parent?.name.match(/^\d{2} /) ? true : false;
    }

    public getParentJDprefix(): string {
        if (this.parentHasJDprefix() || this.parentHasTopLevelJDprefix()) {
            const parentIndexPart = this.file.parent ? this.file.parent.name.substring(0, this.file.parent.name.indexOf(' ')) : '';
            return parentIndexPart;
        }
        return ''
    }

    public getParentJDprefixLevel():number {
        return this.parentHasTopLevelJDprefix() ? 0 : (this.getParentJDprefix().match(/\./g) || []).length + 1
    }
}

/**
 * Get the JD prefix level of a file/folder name (not its parent).
 * Returns: 0 for XX-YY prefix, 1 for XX prefix, 2 for XX.YY prefix, -1 for no prefix
 */
export function getJDprefixLevel(name: string): number {
    if (name.match(/^\d{2}\-\d{2} /)) return 0;  // Top-level area (e.g., "00-09 Area")
    if (name.match(/^\d{2} /)) return 1;         // Category (e.g., "01 Category")  
    if (name.match(/^\d{2}\.\d{2} /)) return 2;  // ID (e.g., "01.01 Item")
    return -1;  // No JD prefix
}

/**
 * Strip any Johnny Decimal prefix from the target path string
 * @param path - full file/folder path (relative to vault root)  
 */
export function stripJDIndexesFromPath(path: string): string {
    if (!path) throw Error("stripJDIndexesFromPath: empty path");

    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
        parts[i] = parts[i].replace(/^((?:\d{2}\-\d{2})|(?:\d{2}\.\d{2})|(?:\d{2})) (.*)$/, '$2');
    }

    return parts.join('/');
}

export function getLevel1PrefixFolderName(file: TAbstractFile, jdFile: JDFileAttributes): string {
    if (!file.parent) return jdFile.filePlainName;

    const siblings = file.parent.children;
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
    if (newPrefixNumber.toString() > jdFile.getParentJDprefix().substring(4)) { 
        new Notice("There is no more space for additional categories in this area!");
        return jdFile.filePlainName;
    }

    // Add or update prefix
    if (!jdFile.hasJDprefix || (jdFile.fileJDprefix !== jdFile.getParentJDprefix()[0] + String(newPrefixNumber))) {
        let newPrefixedName = newPrefixNumber.toString().padStart(2, jdFile.getParentJDprefix()[0]) + " " + jdFile.filePlainName;
        return newPrefixedName;
    }
    
    return file.name;
}

export function getLevel2PrefixFolderName(file: TAbstractFile, jdFile: JDFileAttributes): string {
    if (!file.parent) return jdFile.filePlainName;

    const siblings = file.parent.children;
    const siblingPrefixes = siblings
        .filter(sibling => sibling.name !== file.name)
        .filter(sibling => sibling instanceof TFolder)
        .map(sibling => sibling.name.match(/^\d{2} /) || sibling.name.match(/^\d{2}\.\d{2} /))
        .filter(matched => matched !== null)
        .sort()
        .map(matched => matched[0].substring(0, matched[0].indexOf(' ')));

    const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));
    const newPrefixNumber = Math.max(Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1, 11) || 11;
    const newPrefixedName = jdFile.getParentJDprefix() + "." + newPrefixNumber + " " + jdFile.filePlainName;
    return newPrefixedName;
}

export function getFileNameFlattened(file: TAbstractFile, jdFile: JDFileAttributes): string {
    const prefixRegex = RegExp(`^${jdFile.getParentJDprefix()}.\\d{2} `);

    if (jdFile.getParentJDprefixLevel() == 1 && (!jdFile.hasJDprefix
        || !jdFile.fileJDprefix.match(prefixRegex)))
    {
        if (!file.parent) return jdFile.filePlainName;

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

    console.log("file flattened - fallback to leaving the same name")
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
        .map(sibling => (sibling.name.match(/^\d{2} /) || sibling.name.match(/^\d{2}\.\d{2} /)))
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

    // TODO: if it has a right type/level of a prefix, then only change the parent part
    // Add or update prefix
    if (!jdFile.hasJDprefix || (jdFile.fileJDprefix !== jdFile.getParentJDprefix() + "." + prefixIDpart)) {
        let newPrefixedName = jdFile.getParentJDprefix() + "." + prefixIDpart + " " + jdFile.filePlainName;
        return newPrefixedName;
    }

    console.log("folder flattened - fallback to leaving the same name")
    return file.name;
}

// export function getJDprefixFromString(fileName: string): string {
//     if (fileName.match(/^((?:\d{2}\-\d{2})|(?:\d{2}\.\d{2})|(?:\d{2})) /)) {
//         return fileName.substring(0, fileName.indexOf(' '));
//     }
//     return '';
// }
