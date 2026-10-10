/* App configuration (public file - no secrets, no passwords) */
window.EC = window.EC || {};
EC.CONFIG = {
  /* Google Drive database: OAuth 2.0 "Web application" client ID from console.cloud.google.com
     (authorised JavaScript origin https://ravutha01-cmd.github.io). A client ID is public by design. */
  googleClientId: '',
  /* Drive location of the database (created by the app on the first Admin sign-in, in the
     signed-in Google account's own Drive) */
  driveFolder: 'CAMBO STRUCT',
  driveFile: 'CAMBO STRUCT database.json'
};
