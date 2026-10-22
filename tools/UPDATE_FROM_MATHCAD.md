# Keeping the web app in step with the Mathcad worksheets

Drive account: `ravutha01@gmail.com` (previously `ravutha.me@gmail.com`; Drive file ids in `tools/drive_index.json` are from the old account and are matched by file name).

Rule: **one Mathcad worksheet = one element type.** When a worksheet in the Google Drive folder
`math.Claude` (folder id `1xXrQ0eAinLHwbvUL_Wh30-6BzprqpM27`) is changed, its web calculation
must be regenerated; when a new `.mcdx` file appears there, it becomes a new element type.
Never retype or edit formulas by hand - always regenerate from the `.mcdx` file.

`tools/drive_index.json` records every worksheet (Drive id, folder, modifiedTime) and the time of
the last sync (`lastSync`).

## Procedure

1. Find changed and new worksheets with the Google Drive `search_files` tool:
   `title contains '.mcdx' and modifiedTime > '<lastSync>'`
   (also page through `nextPageToken`). Ignore `backup`, `_calc_test` and dated copies
   such as `*_2025-09-30.mcdx`.
2. Keep only files inside `math.Claude`: follow `parentId` upwards with `get_file_metadata`
   until you reach `1xXrQ0eAinLHwbvUL_Wh30-6BzprqpM27` (skip files that never reach it).
   Record the folder path below `math.Claude` (e.g. `EC2_Concrete\Beam_Design`).
   If two copies of a file name exist, use the most recently modified one.
3. Download each file with `download_file_content` (the result is saved to a tool-results file).
4. Write the list of downloaded files to a JSON file
   `[{"file": "X.mcdx", "id": "...", "folder": "...", "modifiedTime": "..."}]` and run
   `python3 -I tools/ingest_drive.py <empty scratch dir> <that json>`.
   This regenerates `sheets/<name>.js`, updates `js/mcad/catalog.js` (new worksheets are
   classified automatically; add a proper name / group / mark prefix to the table `C` in
   `tools/catalog.py` and run the script again) and updates `tools/drive_index.json`.
   **Worksheets that read Excel** (`READEXCEL`, e.g. `Beam_EC2-2023.mcdx` with `Beam_Input.xlsx`): also export the
   workbook from the same Drive folder to `tools/excel/<file>.xlsx.json` (`{"source": ..., "rows": [[...], ...]}`,
   first sheet, header row included) and record it under `excel` in `tools/drive_index.json`. The converter embeds
   the table; `READEXCEL` returns it and each `info("key", default)` region becomes an editable input.
   When the workbook changes on Drive, update the JSON and regenerate.
5. Test: `node tools/test_sheets.js` (all ok, except the ETABS / HandInput sheets that need
   Excel data). Load the app in a browser and open the new / changed element types.
6. Commit to `master` and push. Republish the Claude artifact
   https://claude.ai/artifact/LnvnyVatFBdQfcw1LxZF4g if this session can (same file list as before,
   capabilities `db` + `user`), adding any new `sheets/*.js` files.

Element data saved by users is kept: inputs are stored as overrides by variable name, so a changed
worksheet keeps the user's values for inputs that still exist; new inputs take the worksheet value.
