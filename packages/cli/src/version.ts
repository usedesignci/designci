/**
 * The published version. Kept as source rather than read from package.json at
 * runtime: the file relative to dist/ after publish is not where it is in the
 * repo, and a version constant cannot fail to resolve. The release script
 * updates this alongside package.json.
 */
export const version = '0.0.0'
