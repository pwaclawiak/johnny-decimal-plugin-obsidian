import { TAbstractFile } from 'obsidian';
import { stripJDIndexesFromPath } from './utils'


// Name string or a function to check sibling prefixes on rename attempt.
export type newNameOrFactory = string | ((file: TAbstractFile) => Promise<string> | string);

// Per-parent queue to lock rename operations in the same parent folder.
export const renameQueue: Map<string, Promise<void>> = new Map();
export const renameInProgress: Set<string> = new Set();

/**
* Try to rename safely: re-resolve the file if needed and retry a few times
* to avoid "file does not exist" errors when parent folders are being moved.
*/
export async function safeRename(vault: any, file: TAbstractFile, newNameOrFactory: newNameOrFactory, maxRetries = 3): Promise<void> {
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
        console.log(stripJDIndexesFromPath(file.path) + ": " + file.path + " --> " + newPath);

        try {
            await vault.rename(file, newPath);
            return;
        } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 20 + attempt * 10));
            attempt++;
        }
    }
    throw lastErr;
}

// Enqueued rename that serializes by parent path and uses safeRename.
export function enqueueRename(vault: any, file: TAbstractFile, newNameOrFactory: newNameOrFactory): Promise<void> {
    const strippedPath = stripJDIndexesFromPath(file.path);
    const strippedParentPath = file.parent ? stripJDIndexesFromPath(file.parent.path) : "";

    if (!renameInProgress.has(strippedPath)) {
        const existing = renameQueue.get(strippedParentPath) ?? Promise.resolve();
        const next = existing.then(() => safeRename(vault, file, newNameOrFactory));

        renameQueue.set(strippedParentPath, next);
        renameInProgress.add(strippedPath);

        next.finally(() => {
            renameInProgress.delete(strippedPath);
            if (renameQueue.get(strippedParentPath) === next) {
                renameQueue.delete(strippedParentPath);
            }
        });
        return next;
    }
    return Promise.resolve();

    // const parentPath = file.parent ? file.parent.path : "";
    // return enqueueAfterParent(parentPath, () => safeRename(vault, file, newNameOrFactory));
}
