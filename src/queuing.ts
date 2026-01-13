import { TAbstractFile, TFile, TFolder, FileManager } from 'obsidian';
import { getFileNameFlattened, getFolderNameFlattened, getLevel1PrefixFolderName, getLevel2PrefixFolderName, JDFileAttributes, stripJDIndexesFromPath, getJDprefixLevel } from './utils'
import { JohnnyDecimalPluginSettings } from 'settings';


// Per-parent queue to lock rename operations in the same parent folder.
export const renameQueue: Map<string, Promise<void>> = new Map();
// Tracks paths currently being processed (by stripped path).
export const renameInProgress: Set<string> = new Set();
// Tracks subtrees being processed to skip child events.
export const subtreeInProgress: Set<string> = new Set();

// Optional debounce timer for rapid moves.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSubtrees: Map<string, { vault: any; fileManager: FileManager; file: TAbstractFile; settings: JohnnyDecimalPluginSettings }> = new Map();

/**
 * Compute the new name for a file/folder based on its parent's JD prefix level.
 * Returns the plain name (prefix stripped) if no prefix should be applied.
 */
function computeNewName(
    file: TAbstractFile,
    jdFile: JDFileAttributes,
    settings: JohnnyDecimalPluginSettings,
    forceStripPrefix: boolean = false
): string {
    // If forced to strip (level 3+ items), just return plain name
    if (forceStripPrefix) {
        return jdFile.filePlainName;
    }

    // Parent has no JD prefix - strip any existing prefix from child
    if (!jdFile.parentHasJDprefix() && !jdFile.parentHasTopLevelJDprefix()) {
        return jdFile.hasJDprefix ? jdFile.filePlainName : file.name;
    }

    // Parent has JD prefix - compute appropriate child prefix
    if (file instanceof TFile) {
        if (settings.divergeFromOriginalJD && settings.flattenedStructure) {
            return getFileNameFlattened(file, jdFile);
        } else {
            return jdFile.filePlainName;
        }
    } else if (file instanceof TFolder) {
        if (!file.parent) return jdFile.filePlainName;
        
        const parentLevel = jdFile.getParentJDprefixLevel();
        
        if (parentLevel === 0) {
            // Parent is level 0 (XX-YY) → child gets level 1 prefix (XX)
            return getLevel1PrefixFolderName(file, jdFile);
        } else if (parentLevel === 1) {
            // Parent is level 1 (XX) → child gets level 2 prefix (XX.YY)
            if (settings.divergeFromOriginalJD && settings.flattenedStructure) {
                return getFolderNameFlattened(file, jdFile, settings.foldersInFirstTen);
            } else {
                return getLevel2PrefixFolderName(file, jdFile);
            }
        }
        // Parent is level 2+ → no prefix for child (or strip existing)
        return jdFile.filePlainName;
    }

    return file.name;
}

/**
 * Perform a single rename operation with retries.
 */
async function doRename(
    vault: any,
    file: TAbstractFile,
    newName: string,
    maxRetries = 3
): Promise<TAbstractFile | null> {
    let attempt = 0;
    let lastErr: any = null;

    while (attempt < maxRetries) {
        // Re-resolve file reference
        const resolved = vault.getAbstractFileByPath(file.path);
        if (!resolved) {
            console.log(`File not found, skipping: ${file.path}`);
            return null;
        }
        file = resolved;

        // Skip if name unchanged
        if (file.name === newName) {
            return file;
        }

        // Compute new path
        const currentPath = file.path || "";
        const parentSepIndex = currentPath.lastIndexOf("/");
        const currentParentPath = parentSepIndex >= 0 ? currentPath.substring(0, parentSepIndex) : "";
        const newPath = (currentParentPath === "" ? "" : currentParentPath + "/") + newName;

        console.log(`Renaming: ${file.path} → ${newPath}`);

        try {
            await vault.rename(file, newPath);
            // Re-resolve after rename
            return vault.getAbstractFileByPath(newPath) || null;
        } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 50 + attempt * 30));
            attempt++;
        }
    }

    console.error(`Failed to rename after ${maxRetries} attempts: ${file.path}`, lastErr);
    return null;
}

/**
 * Schedule and execute renames for a folder subtree.
 * Order: parent first, then direct children, then grandchildren (for prefix stripping only).
 */
export async function scheduleSubtreeRenames(
    vault: any,
    fileManager: FileManager,
    movedItem: TAbstractFile,
    settings: JohnnyDecimalPluginSettings
): Promise<void> {
    const strippedPath = stripJDIndexesFromPath(movedItem.path);
    
    // Mark entire subtree as in progress
    subtreeInProgress.add(strippedPath);
    renameInProgress.add(strippedPath);

    try {
        // Step 1: Process the moved item itself (parent)
        const jdFile = new JDFileAttributes(movedItem, movedItem.path);
        const newParentName = computeNewName(movedItem, jdFile, settings);
        const renamedParent = await doRename(vault, movedItem, newParentName);
        
        if (!renamedParent || !(renamedParent instanceof TFolder)) {
            // If it's a file or rename failed, we're done
            return;
        }

        // Step 2: Process direct children (level 1 relative to moved item)
        const children = renamedParent.children || [];
        for (const child of children) {
            const childStrippedPath = stripJDIndexesFromPath(child.path);
            renameInProgress.add(childStrippedPath);
            
            try {
                const childJdFile = new JDFileAttributes(child, child.path);
                const newChildName = computeNewName(child, childJdFile, settings);
                const renamedChild = await doRename(vault, child, newChildName);

                // Step 3: Process grandchildren (level 2 relative to moved item) - STRIP PREFIXES ONLY
                if (renamedChild && renamedChild instanceof TFolder) {
                    const grandchildren = renamedChild.children || [];
                    for (const grandchild of grandchildren) {
                        const gcStrippedPath = stripJDIndexesFromPath(grandchild.path);
                        renameInProgress.add(gcStrippedPath);
                        
                        try {
                            const gcJdFile = new JDFileAttributes(grandchild, grandchild.path);
                            // Force strip prefix for level 3+ items
                            const newGcName = computeNewName(grandchild, gcJdFile, settings, true);
                            await doRename(vault, grandchild, newGcName);
                        } finally {
                            renameInProgress.delete(gcStrippedPath);
                        }
                    }
                }
            } finally {
                renameInProgress.delete(childStrippedPath);
            }
        }
    } finally {
        subtreeInProgress.delete(strippedPath);
        renameInProgress.delete(strippedPath);
    }
}

/**
 * Schedule subtree renames with optional debouncing for rapid operations.
 */
export function scheduleSubtreeRenamesDebounced(
    vault: any,
    fileManager: FileManager,
    file: TAbstractFile,
    settings: JohnnyDecimalPluginSettings,
    debounceMs: number = 0
): Promise<void> {
    const strippedPath = stripJDIndexesFromPath(file.path);

    if (debounceMs <= 0) {
        // No debounce - execute immediately
        return scheduleSubtreeRenames(vault, fileManager, file, settings);
    }

    // Add to pending
    pendingSubtrees.set(strippedPath, { vault, fileManager, file, settings });

    // Clear existing timer
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    // Set new timer
    return new Promise((resolve) => {
        debounceTimer = setTimeout(async () => {
            const pending = new Map(pendingSubtrees);
            pendingSubtrees.clear();
            debounceTimer = null;

            // Process all pending subtrees
            for (const [, data] of pending) {
                await scheduleSubtreeRenames(data.vault, data.fileManager, data.file, data.settings);
            }
            resolve();
        }, debounceMs);
    });
}

/**
 * Check if a path or any of its ancestors is currently being processed.
 */
export function isPathOrAncestorInProgress(path: string): boolean {
    const strippedPath = stripJDIndexesFromPath(path);
    
    // Check exact path
    if (renameInProgress.has(strippedPath)) return true;
    
    // Check if any subtree containing this path is in progress
    for (const subtreePath of subtreeInProgress) {
        if (strippedPath.startsWith(subtreePath + "/") || strippedPath === subtreePath) {
            return true;
        }
    }
    
    return false;
}
