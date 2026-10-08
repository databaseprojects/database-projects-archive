# Found Photographs sheet sync

This script adds a Found Photos menu to the tag sheet. It does not sync while you edit. Nothing runs on a timer.

1. In the sheet, open Extensions > Apps Script, paste `found-photos-sync.gs`, and save.
2. Reload the sheet.
3. Choose Found Photos > Set GitHub token. The token is stored in Script Properties, not in a cell.
4. The first Sync click shows Google's permission screen.
5. Create the token as a fine-grained personal access token for only this repository, with Contents read and write, and an expiry of about 1 year.

Found Photos > Sync to site asks GitHub to run the sheet sync once.
