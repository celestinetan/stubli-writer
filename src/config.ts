/**
 * Settings for this copy of Stubli Writer.
 *
 * Running your own copy? Make your own Google Cloud "Web application" client (see SETUP.md)
 * and put its Client ID here, or set VITE_GOOGLE_CLIENT_ID when building. A Client ID is not
 * a secret: it's visible in every web app that uses Google sign-in.
 */
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  "321502543076-mp56j0vfi3o2q4dh65qqrkmisao1jfra.apps.googleusercontent.com";

/** The narrowest Drive permission: only files this app created. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** The folder in the person's Drive that holds their notes. */
export const DRIVE_FOLDER_NAME = "Stubli Writer";
