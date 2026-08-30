// path-based heuristics, decide what counts as reviewable source for the size band

const TEST_PATH_SEGMENT = /^(test|tests|__tests__|__mocks__|e2e|integration-tests?)$/i;
/** matches dot or dash test suffixes, bare integration isn't a signal since
 *  other repos use it for production code */
const TEST_FILENAME = /[.-](test|spec)\.tsx?$|\.unit\.tsx?$/i;
const GENERATED_OR_VENDORED_SEGMENT =
  /^(dist|build|generated|__generated__|vendor|third[-_]party|node_modules)$/i;
const GENERATED_FILENAME = /\.generated\.tsx?$|\.d\.ts$/i;

export function isTestFile(path: string): boolean {
  const segments = path.split("/");
  return (
    TEST_FILENAME.test(segments.at(-1) ?? "") || segments.some((s) => TEST_PATH_SEGMENT.test(s))
  );
}

export function isGeneratedOrVendored(path: string): boolean {
  const segments = path.split("/");
  return (
    GENERATED_FILENAME.test(segments.at(-1) ?? "") ||
    segments.some((s) => GENERATED_OR_VENDORED_SEGMENT.test(s))
  );
}

/** ts/tsx, non-test, non-generated, this is what size band and file-touch count measure over */
export function isSourceFile(path: string): boolean {
  return /\.tsx?$/i.test(path) && !isTestFile(path) && !isGeneratedOrVendored(path);
}
