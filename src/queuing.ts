import { TAbstractFile, TFile, TFolder, FileManager, Notice, Vault } from 'obsidian';
import {
    getFileNameFlattened, getFolderNameFlattened, getLevel1PrefixFolderName,
    getLevel2PrefixFolderName, JDFileAttributes, stripJDIndexesFromPath, getJDprefixLevel,
    getFileFolderName,
    isLevel0PrefixAvailable,
    getJDprefix,
    getFileFolderPlainName
} from './utils'
import { JohnnyDecimalPluginSettings } from 'settings';


// Per root-folder queue to synchronize rename operations in the same folder.
export const renameQueue: Map<string, Promise<void>> = new Map();

// Tracks paths currently waiting to be processed (by stripped path).
export const queuedForChange: Set<string> = new Set();

// Optional debounce timer for rapid moves.
// let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// let pendingSubtrees: Map<string, { vault: any; fileManager: FileManager; file: TAbstractFile; settings: JohnnyDecimalPluginSettings }> = new Map();

/**
 * Compute the new name for a file/folder based on its parent's JD prefix level.
 * Returns the plain name (prefix stripped) if no prefix should be applied.
 * 
 * @param oldParentPlainName - Plain name of the parent before any renames (for detecting moves vs parent renames)
 */
function computeNewName(
    file: TAbstractFile,
    jdFile: JDFileAttributes,
    settings: JohnnyDecimalPluginSettings,
    oldPath: string,
    oldParentPath: string,
    newParentName: string,
    fileWasMoved: boolean
): string {

    // Scenario 0: File not moved and has no prefix - do nothing
    if (!fileWasMoved && !jdFile.hasJDprefix) {
        return file.name;
    }

    if (!jdFile.parentHasJDprefix() && !jdFile.parentHasTopLevelJDprefix()) {
        // Scenario 1: No JD prefix on parent - file moved outside of index
        if (fileWasMoved) {
            // If moved to non-JD parent, strip any existing prefix
            return jdFile.hasJDprefix ? jdFile.filePlainName : file.name;
            // Scenario 2: level_0 prefix added manually
        } else if (jdFile.hasJDprefix && getJDprefixLevel(jdFile.oldName) === 0) {
            // This means file has been added a level 0 prefix manually
            if (isLevel0PrefixAvailable(file)) {
                return jdFile.oldName;
            } else {
                // Prefix not available, revert change
                new Notice(`Prefix ${getJDprefix(jdFile.oldName)} is already in use. Reverting to previous name.`);
                return getFileFolderName(oldPath);
            }
        }
    }
    
    // Standard prefix change
    if (file instanceof TFile) {
        if (settings.divergeFromOriginalJD && settings.flattenedStructure) {
            return getFileNameFlattened(file, jdFile, oldParentPath, newParentName, fileWasMoved);
        } else {
            return file.name;
        }
    } else if (file instanceof TFolder) {
        if (!file.parent) return jdFile.filePlainName;
        
        const parentLevel = jdFile.getParentJDprefixLevel();
        
        // Scenario 3: Folder has prefix but was not moved - update inherited part only
        if (!fileWasMoved && jdFile.hasJDprefix) {
            if (parentLevel === 0) {
                // Parent is level 0 (XX-YY), child should have level 1 prefix (XX)
                return getLevel1PrefixFolderName(file, jdFile, oldPath, oldParentPath, newParentName, fileWasMoved);
            } else if (parentLevel === 1) {
                // Parent is level 1 (XX), child should have level 2 prefix (XX.YY)
                return getLevel2PrefixFolderName(file, jdFile, oldPath, oldParentPath, newParentName, fileWasMoved);
            }
        }
        // Scenario 4: Folder was moved or no prefix yet - compute new prefix normally
        else if (parentLevel === 0) {
            // Parent is level 0 (XX-YY) → child gets level 1 prefix (XX)
            return getLevel1PrefixFolderName(file, jdFile, oldPath, oldParentPath, newParentName, fileWasMoved);
        } else if (parentLevel === 1) {
            // Parent is level 1 (XX) → child gets level 2 prefix (XX.YY)
            if (settings.divergeFromOriginalJD && settings.flattenedStructure) {
                return getFolderNameFlattened(file, jdFile, settings.foldersInFirstTen);
            } else {
                return getLevel2PrefixFolderName(file, jdFile, oldPath, oldParentPath, newParentName, fileWasMoved);
            }
        }
    }
    
    // Parent is level 2+ (leave unchanged)
    return file.name;
}

/**
 * Perform a single rename operation with retries.
 */
async function safeRename(
    vault: Vault,
    fileManager: FileManager,
    file: TAbstractFile,
    newName: string,
    maxRetries = 3
): Promise<TAbstractFile | null> {
    let attempt = 0;
    let lastErr: any = null;

    while (attempt < maxRetries) {        
        // Wait a bit before retrying to allow filesystem to settle
        await new Promise((r) => setTimeout(r, attempt * 5));

        // Skip if name does not change
        if (file.name === newName) {
            return file;
        }

        // Compute new path
        const currentPath = file.path;
        const parentSepIndex = currentPath.lastIndexOf("/");
        const currentParentPath = parentSepIndex >= 0 ? currentPath.substring(0, parentSepIndex) : "";
        const newPath = (currentParentPath === "" ? "" : currentParentPath + "/") + newName;

        try {
            if (file instanceof TFolder) {
                await vault.rename(file, newPath);
            } else { // TFile
                await fileManager.renameFile(file, newPath);
            }
            // Re-resolve after rename
            return vault.getAbstractFileByPath(newPath) || null;
        } catch (err) {
            lastErr = err;
            attempt++;
        }
    }
    console.error(`Failed to rename after ${maxRetries} attempts: ${file.path}`, lastErr);
    return null;
}

async function enqueueRename(vault: Vault, fileManager: FileManager, file: TAbstractFile, queueKey: string, lockKey: string, newFileName: string): Promise<void> {
    const previousPromise = renameQueue.get(queueKey) || Promise.resolve();
    const nextPromise = previousPromise
        .catch(() => {
            // Swallow previous errors so the chain continues
        })
        .then(async () => {
            try {
                await safeRename(vault, fileManager, file, newFileName);
            } finally {
                queuedForChange.delete(lockKey);
            }
        });

    // Update the queue with the new tail promise
    renameQueue.set(queueKey, nextPromise);
    nextPromise.then(() => {
        // Only delete if the queue hasn't grown since we started
        if (renameQueue.get(queueKey) === nextPromise) {
            renameQueue.delete(queueKey);
        }
    });
    return nextPromise;
}

/**
 * Schedules and executes a series of rename operations for a folder subtree in a hierarchical order.
 * 
 * Processes renames in three levels:
 * 1. The root file/folder itself
 * 2. Direct children of the root
 * 3. Grandchildren (only if root was and remains a level 0 prefix)
 * 
 * Uses a queue to prevent processing non-root items of a subtree independently.
 * Includes retry logic and delays between operations to allow filesystem settlement.
 * 
 * @param vault - The Obsidian vault instance used to perform folder rename operations
 * @param fileManager - The Obsidian FileManager instance to safely rename files (preserving links)
 * @param file - The root file/folder to start the subtree rename from
 * @param oldPath - The old path of the file/folder before the current operation
 * @param settings - Plugin settings that control naming behavior
 * @returns A promise that resolves when all subtree renames are complete
 */
export async function scheduleSubtreeRenames(
    vault: Vault,
    fileManager: FileManager,
    file: TAbstractFile,
    oldPath: string,
    settings: JohnnyDecimalPluginSettings
): Promise<void> {

    const queueKey = stripJDIndexesFromPath(file.path);
    const rootStrippedPath = stripJDIndexesFromPath(file.path);
    
    // Lock the queue right away to prevent concurrent processing
    queuedForChange.add(rootStrippedPath);

    // Step 1: Process the moved item itself (root)
    const jdFile = new JDFileAttributes(file, file.path);
    const oldParentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const rootWasMoved = file.path.substring(0, file.path.lastIndexOf('/')) !== oldPath.substring(0, oldPath.lastIndexOf('/'));
    const rootNewParentName = file.parent ? getFileFolderName(file.parent.path) : "";
    const newFileName = computeNewName(file, jdFile, settings, oldPath, oldParentPath, rootNewParentName, rootWasMoved);

    const rootInitialJDPrefix = getJDprefix(getFileFolderName(oldPath));
    const rootInitialLevel = getJDprefixLevel(getFileFolderName(oldPath));
    const rootNewLevel = getJDprefixLevel(newFileName);
    const prefixChanges = (rootInitialJDPrefix !== getJDprefix(newFileName));
    
    enqueueRename(vault, fileManager, file, queueKey, queueKey, newFileName);
    
    if (!prefixChanges || !(file instanceof TFolder)) {
        await renameQueue.get(queueKey);
        queuedForChange.delete(rootStrippedPath);
        return;
    }

    // Step 2: Process direct children (level 1 relative to moved item)
    for (const child of file.children) {
        const childOldPath = oldPath + '/' + child.name;
        const childStrippedOldPath = stripJDIndexesFromPath(childOldPath);
        const childJdFile = new JDFileAttributes(child, childOldPath);
        const newChildName = computeNewName(child, childJdFile, settings, childOldPath, oldPath, newFileName, false);
        
        // IDEA: If multiple renames happen, try only queue if it is not already queued
        queuedForChange.add(childStrippedOldPath);
        enqueueRename(vault, fileManager, child, queueKey, childStrippedOldPath, newChildName);

        // Step 3: Process grandchildren (only if root was and remains level 0)
        if (rootInitialLevel !== 0 || rootNewLevel !== 0 || !(child instanceof TFolder)) continue;
        
        for (const grandchild of child.children) {
            const gcOldPath = childOldPath + '/' + grandchild.name;
            const gcStrippedOldPath = stripJDIndexesFromPath(gcOldPath);
            const gcJdFile = new JDFileAttributes(grandchild, grandchild.path);
            const newGcName = computeNewName(grandchild, gcJdFile, settings, gcOldPath, childOldPath, newChildName, false);

            queuedForChange.add(gcStrippedOldPath);
            enqueueRename(vault, fileManager, grandchild, queueKey, gcStrippedOldPath, newGcName);
        }
    }

    // After scheduling all, wait for completion
    await renameQueue.get(queueKey);
}

/** 
 * Check if the rename queue is empty.
 */
export function isQueueEmpty(): boolean {
    return queuedForChange.size === 0;
}

/**
 * Check if a path or any of its ancestors is currently being processed.
 */
export function isQueuedForChange(path: string): boolean {
    return queuedForChange.has(stripJDIndexesFromPath(path)) ? true : false;
}
