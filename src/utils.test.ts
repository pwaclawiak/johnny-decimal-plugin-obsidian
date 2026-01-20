import { describe, it, expect, beforeEach } from 'vitest';
import { getJDprefix, getJDprefixLevel, stripJDIndexesFromPath, JDFileAttributes } from './utils';
// import { TAbstractFile, TFolder, TFile } from 'obsidian';

// These do not work currently because it cannot import from 'obsidian' properly in the test environment

describe('getJDprefix', () => {
    // --- Happy Paths (Valid Johnny Decimal Prefixes) ---
    it('should extract XX-YY prefix', () => {
        expect(getJDprefix('00-09 Area Name')).toBe('00-09');
    });

    it('should extract XX.YY prefix', () => {
        expect(getJDprefix('01.05 Category Item')).toBe('01.05');
    });

    it('should extract XX prefix', () => {
        expect(getJDprefix('02 Category')).toBe('02');
    });

    // --- Edge Cases / Negative Tests ---
    it('should return empty string for no prefix', () => {
        expect(getJDprefix('No Prefix File')).toBe('');
    });

    it('should return empty string for malformed prefix', () => {
        expect(getJDprefix('1-2 Invalid')).toBe('');
    });

    it('should return empty string if there is no space after the prefix', () => {
        expect(getJDprefix('12-34Project')).toBe('');
    });

    it('should return empty string if the prefix is not at the start', () => {
        expect(getJDprefix('Copy of 12-34 Budget')).toBe('');
    });

    it('should return empty string for an empty input', () => {
        expect(getJDprefix('')).toBe('');
    });
});




// describe('getJDprefixLevel', () => {
//     it('should return 0 for XX-YY prefix (top-level area)', () => {
//         expect(getJDprefixLevel('00-09 Area')).toBe(0);
//     });

//     it('should return 1 for XX prefix (category)', () => {
//         expect(getJDprefixLevel('01 Category')).toBe(1);
//     });

//     it('should return 2 for XX.YY prefix (ID)', () => {
//         expect(getJDprefixLevel('01.05 Item')).toBe(2);
//     });

//     it('should return -1 for no prefix', () => {
//         expect(getJDprefixLevel('No Prefix')).toBe(-1);
//     });
// });

// describe('stripJDIndexesFromPath', () => {
//     it('should strip JD prefix from single level path', () => {
//         expect(stripJDIndexesFromPath('01 Category')).toBe('Category');
//     });

//     it('should strip JD prefixes from multi-level path', () => {
//         expect(stripJDIndexesFromPath('00-09 Area/01 Category/01.05 Item')).toBe('Area/Category/Item');
//     });

//     it('should handle paths with no prefixes', () => {
//         expect(stripJDIndexesFromPath('Area/Category/Item')).toBe('Area/Category/Item');
//     });

//     it('should throw error on empty path', () => {
//         expect(() => stripJDIndexesFromPath('')).toThrow('stripJDIndexesFromPath: empty path');
//     });
// });

// describe('JDFileAttributes', () => {
//     let mockFile: TAbstractFile;

//     beforeEach(() => {
//         mockFile = {
//             name: 'test.md',
//             parent: {
//                 name: '01 Parent',
//                 children: [],
//             } as unknown as TFolder,
//         } as unknown as TAbstractFile;
//     });

//     it('should extract file name from path', () => {
//         const attrs = new JDFileAttributes(mockFile, 'vault/01 Parent/01.05 Test File');
//         expect(attrs.fileName).toBe('01.05 Test File');
//     });

//     it('should detect JD prefix', () => {
//         const attrs = new JDFileAttributes(mockFile, 'vault/01 Parent/01.05 Test File');
//         expect(attrs.hasJDprefix).toBe(true);
//         expect(attrs.fileJDprefix).toBe('01.05');
//     });

//     it('should extract plain name', () => {
//         const attrs = new JDFileAttributes(mockFile, 'vault/01 Parent/01.05 Test File');
//         expect(attrs.filePlainName).toBe('Test File');
//     });

//     it('should handle files without JD prefix', () => {
//         const attrs = new JDFileAttributes(mockFile, 'vault/01 Parent/Regular File');
//         expect(attrs.hasJDprefix).toBe(false);
//         expect(attrs.fileJDprefix).toBe('');
//         expect(attrs.filePlainName).toBe('Regular File');
//     });

//     it('should get parent JD prefix level', () => {
//         const attrs = new JDFileAttributes(mockFile, 'vault/01 Parent/01.05 Test');
//         expect(attrs.getParentJDprefixLevel()).toBe(1);
//     });
// });