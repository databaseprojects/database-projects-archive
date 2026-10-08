/**
 * Menu for the Found Photographs tag sheet.
 * Paste this file into Extensions > Apps Script. It does not run on edit.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Found Photos')
    .addItem('Sync to site', 'syncToSite')
    .addItem('Set GitHub token', 'setGitHubToken')
    .addToUi();
}

function setGitHubToken() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'GitHub token',
    'Paste a fine-grained token for this repository. It is saved in Script Properties, not in a cell.',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  var token = result.getResponseText().trim();
  if (!token) {
    SpreadsheetApp.getActiveSpreadsheet().toast('No token was entered.', 'Found Photos');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
  SpreadsheetApp.getActiveSpreadsheet().toast('Token saved.', 'Found Photos');
}

function syncToSite() {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!token) {
    sheet.toast('No GitHub token is set. Choose Found Photos, then Set GitHub token.', 'Found Photos');
    return;
  }
  var response = UrlFetchApp.fetch(
    'https://api.github.com/repos/databaseprojects/database-projects-archive/dispatches',
    {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json'
      },
      payload: JSON.stringify({ event_type: 'sheet-sync' })
    }
  );
  var code = response.getResponseCode();
  if (code === 204) {
    sheet.toast('Sync requested. The site will update shortly.', 'Found Photos');
    return;
  }
  sheet.toast('Sync failed (' + code + '). Check the token and try again.', 'Found Photos');
}
