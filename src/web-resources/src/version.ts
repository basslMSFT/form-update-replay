declare const __APP_VERSION__: string | undefined;

/** The release this bundle was built from; build.mjs injects it from package.json. */
export const VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
