# Changelog
## Version 0.9.0
### Changes
1. ✅ Moving a folder should not drop the children's IDs
2. ✅ Renaming should not either.
3. ✅ Renaming a level_1 folder to have a level_0 prefix should be handled *somehow*, but cannot naively change children prefixes as there are only 9 slots available on level_1, compared to 89 on level_2
4. ✅ If a parent folder changes its prefix and file/folder does not have a prefix it should NOT be given one
5. ✅ Add option to allow for ANY manual change of the file/folder names (except giving incorrect prefixes of the expected level)
6. ✅ Do not remove prefixes on parent move (tideous work to add them back manually)

### Bugfixes
1. ✅ Changing folder name by hand does not allow for free operation and changes the name to what if evaluates to be correct - impossible to set level_0 prefixes, one potentially desirable feature comes with this - if one tries to change a prefix to one from out of range of the parent, it will be renamed to one from the range.
> - [x] fix setting level_0 prefixes
> - [x] fix setting prefix if parent does not have one
> - [x] fix setting prefix of another level than expected in the parent folder
2. ✅ If a folder has a valid level_1 prefix in its area i.e. 05 and it is manually changed to one of outside that range, it accepts the category part of the newly set incorrect prefix, which is likely to cause doubled prefixes in the same folder. Solution would be either to read the previous prefix from oldPath and keep it, or assign it a new one from the available ones in the area.
3. ✅ Flattened mode does not change TFile name on move
4. ✅ Flatten mode file - moving parent outside JD index drops part of the file prefix and makes the file hidden (starts with a dot <.>). The same goes for any situation where parent loses its prefix (i.e. moving down the structure)