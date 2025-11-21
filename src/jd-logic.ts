import { TAbstractFile, TFolder, Notice, TFile } from 'obsidian';
import { enqueueRename } from './queuing';
import { JDFileAttributes } from './utils';


export async function handleFileFlattenedStructure(jdFile: JDFileAttributes
): Promise<void>{
    // TODO: block adding IDs to folders 01.01 in flatten with folders in first ten slots
    if (jdFile.getParentJDprefixLevel() < 2 &&
        (!jdFile.hasJDprefix || !jdFile.fileJDprefix?.match(RegExp(`^${jdFile.getParentJDprefix()}.\\d{2}`)))) {
        // compute prefix inside queued factory so siblings are read in serialized order
        await enqueueRename(this.app.vault, jdFile.file, async (f: TAbstractFile) => {
            if (!f.parent) return jdFile.filePlainName;
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
            return jdFile.getParentJDprefix() + "." + newPrefixNumber.toString() + " " + jdFile.filePlainName;
        });
        return;
    }
}

export async function handleFolderFlattenedStructure(jdFile:JDFileAttributes): Promise<void> {
    const vault = jdFile.file.vault;

    // compute currently-used sibling prefixes at the time the queued op runs
    await enqueueRename(vault, jdFile.file, async (f: TAbstractFile) => {
        if (!f.parent) return jdFile.filePlainName;

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
            return jdFile.filePlainName;
        }

        let newPrefixNumber = first10prefixes.filter(val => !usedPrefixNumbers.includes(val))[0];
        let prefixIDpart = newPrefixNumber.toString().padStart(2, jdFile.getParentJDprefix()[0]);

        // Add or update prefix
        if (!jdFile.hasJDprefix || (jdFile.fileJDprefix !== jdFile.getParentJDprefix() + "." + prefixIDpart)) {
            let newPrefixedName = jdFile.getParentJDprefix() + "." + prefixIDpart + " " + jdFile.filePlainName;
            return newPrefixedName;
        }

        return f.name;
    });
}

export async function setLevel1Prefix(jdFile:JDFileAttributes): Promise<void> {
    // compute new prefix inside queued factory
    await enqueueRename(this.app.vault, jdFile.file, async (f: TAbstractFile) => {
        if (!f.parent) return jdFile.filePlainName;

        const siblings = f.parent.children;
        const siblingPrefixes = siblings
            .filter(sibling => sibling.name !== jdFile.file.name)
            .filter(sibling => sibling instanceof TFolder)
            .map(sibling => sibling.name.match(/^\d{2} /) || sibling.name.match(/^\d{2}\.\d{2} /))
            .filter(matched => matched !== null)
            .sort()
            .map(matched => matched[0].substring(0, matched[0].indexOf(' ')));

        const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));
        const newPrefixNumber = Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1 || 1;

        // Top level folder full - do not add prefix
        if (newPrefixNumber.toString() > jdFile.getParentJDprefix().substring(4)) { 
            new Notice("There is no more space for additional categories in this folder!");
            return jdFile.filePlainName;
        }

        // Add or update prefix
        if (!jdFile.hasJDprefix || (jdFile.fileJDprefix !== jdFile.getParentJDprefix()[0] + String(newPrefixNumber))) {
            let newPrefixedName = newPrefixNumber.toString().padStart(2, jdFile.getParentJDprefix()[0]) + " " + jdFile.filePlainName;
            return newPrefixedName;
        }
        return f.name;
    });
}

export async function setLevel2Prefix(jdFile: JDFileAttributes): Promise<void> {
    await enqueueRename(this.app.vault, jdFile.file, async (f: TAbstractFile) => {
        if (!f.parent) return jdFile.filePlainName;

        const siblings = f.parent.children;
        const siblingPrefixes = siblings
            .filter(sibling => sibling.name !== jdFile.file.name)
            .filter(sibling => sibling instanceof TFolder)
            .map(sibling => sibling.name.match(/^\d{2} /) || sibling.name.match(/^\d{2}\.\d{2} /))
            .filter(matched => matched !== null)
            .sort()
            .map(matched => matched[0].substring(0, matched[0].indexOf(' ')));

        const usedPrefixNumbers = siblingPrefixes.map(p => p.substring(p.lastIndexOf('.') + 1));
        const newPrefixNumber = Math.max(Number(usedPrefixNumbers[usedPrefixNumbers.length - 1]) + 1, 11) || 11;
        const newPrefixedName = jdFile.getParentJDprefix() + "." + newPrefixNumber + " " + jdFile.filePlainName;
        return newPrefixedName;
    });
}

export async function removePrefixIfPresent(file: TAbstractFile, hasJDprefix: boolean, filePlainName: string): Promise<void> {
    if (!hasJDprefix) return;
    const vault = file.vault;
    await enqueueRename(vault, file, filePlainName);
}