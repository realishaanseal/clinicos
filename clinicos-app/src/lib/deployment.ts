/**
 * Where this copy of ClinicOS is running, for wording only.
 *
 * NEXT_PUBLIC_CLINICOS_ONLINE=1 on the hosted copy changes what the screens
 * say — "running locally" would be untrue there — and shows the prototype
 * banner. It is never a security control: anything that must behave
 * differently online is keyed to DATA_BACKEND on the server.
 *
 * No Node imports; client components read this.
 */
export const ONLINE = process.env.NEXT_PUBLIC_CLINICOS_ONLINE === "1";
