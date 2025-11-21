
import { TAbstractFile } from 'obsidian';


export class JDFileAttributes {
    file: TAbstractFile
    fileName: string
    hasJDprefix: boolean
    fileJDprefix: string | null
    filePlainName: string

    constructor(file: TAbstractFile, oldPath: string) {
        this.file = file;
        this.fileName = oldPath.substring(oldPath.lastIndexOf("/") + 1)  // Old file name

        this.hasJDprefix = (this.fileName.match(/^\d{2}\-\d{2} /) ||
            this.fileName.match(/^\d{2}\.\d{2} /) ||
            this.fileName.match(/^\d{2} /)) ? true : false;
        this.fileJDprefix = this.hasJDprefix ? this.fileName.substring(0, this.fileName.indexOf(' ')) : null;
        this.filePlainName = this.hasJDprefix ? this.fileName.substring(this.fileName.indexOf(' ') + 1) : this.fileName;
    }

    /**
     * parentHasTopLevelJDPrefix
     */
    public parentHasTopLevelJDprefix():boolean {
        return this.file.parent?.name.match(/^\d{2}\-\d{2} /) ? true : false;
    }

    /**
     * parentHasJDprefix
     */
    public parentHasJDprefix():boolean {
        return this.file.parent?.name.match(/^\d{2}\.\d{2} /) || this.file.parent?.name.match(/^\d{2} /) ? true : false;
    }

    /**
     * parentJDprefix
     */
    public getParentJDprefix(): string {
        if (this.parentHasJDprefix() || this.parentHasTopLevelJDprefix()) {
            const parentIndexPart = this.file.parent ? this.file.parent.name.substring(0, this.file.parent.name.indexOf(' ')) : '';
            console.log(parentIndexPart);
            return parentIndexPart;
        }
        return ''
    }

    /**
     * getParentJDprefixLevel
     */
    public getParentJDprefixLevel():number {
        return this.parentHasTopLevelJDprefix() ? 0 : (this.getParentJDprefix().match(/\./g) || []).length + 1
    }
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

// export async function setLevel1Prefix(file: TAbstractFile, filePlainName: string, newPrefixNumber: number, parentJDprefix: string): Promise<string> {
//     const vault = file.vault;

//     if (!file.parent) {
//         throw Error("Structure error - expected a parent directory but found none.")
//     }

//     let newPrefixedName = newPrefixNumber.toString().padStart(2, parentJDprefix[0]) + " " + filePlainName;
//     console.log(`Rename: ${file.path} --> ${file.parent.path + "/" + newPrefixedName}`)
//     await enqueueRename(vault, file, newPrefixedName);

//     return newPrefixedName
// }

// export async function setLevel2Prefix(file: TAbstractFile, filePlainName: string, usedPrefixNumbers: Array<string>, parentJDprefix: string,): Promise<string> {
//     const vault = file.vault;

//     if (!file.parent) {
//         throw Error("Structure error - expected a parent directory but found none.")
//     }

//     let newPrefixNumber = Math.max(Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1, 11) || 11;
//     let newPrefixedName = parentJDprefix + "." + newPrefixNumber + " " + filePlainName;
//     console.log(`Rename: ${file.path} --> ${file.parent.path + "/" + newPrefixedName}`)
//     await enqueueRename(vault, file, newPrefixedName);

//     return newPrefixedName
// }
