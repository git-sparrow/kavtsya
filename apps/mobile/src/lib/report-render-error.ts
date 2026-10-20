/**
 * Where a render error caught by an error boundary leaves the app (#216). Crash
 * reporting (#217) fills this in, so a vendor SDK is wired here and never into
 * the boundary component.
 *
 * Until then it deliberately does nothing: React Native already logs every
 * caught render error itself (its `onCaughtError` hands it to ExceptionsManager
 * as non-fatal: LogBox in a dev build, the native log in a release one), so a
 * `console.error` here would only log it twice.
 */
export function reportRenderError(error: Error): void {
  void error;
}
