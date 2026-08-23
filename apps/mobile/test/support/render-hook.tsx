import {
  act,
  Fragment,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "test-renderer";

/**
 * Rendering a hook without a DOM (#53).
 *
 * `test-renderer` builds an in-memory tree instead of DOM nodes, so the hooks in
 * this app — plain React, no React Native in them — can be exercised in the Node
 * environment. That is the whole reason this file exists: the alternative,
 * `@testing-library/react`, renders through `react-dom` into jsdom, which drags
 * `react-dom` into the repo as a dependency that must then be pinned to `react`
 * and held on the Expo track forever. This is ~60 lines instead.
 *
 * It is deliberately the smallest thing that serves our tests, not a general
 * testing library. Anything rendering React Native components still stays out of
 * the runner entirely; those go through Argent (docs/argent-howto.md).
 */

declare global {
  // React refuses to run `act()` unless this is set — normally a testing
  // library's job. Declared as `var` because that is the only form TypeScript
  // accepts for augmenting `globalThis`.
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Every root this file mounted, so `cleanup` can unmount them all. */
const mounted = new Set<Root>();

export type RenderHookResult<T, P> = {
  /** The hook's latest return value, refreshed on every render. */
  result: { current: T };
  /**
   * Render again, optionally with new props. Called with no argument it repeats
   * the current ones — which is how a test observes state the hook set outside
   * a render (an `act`-wrapped call to something it returned).
   */
  rerender: (props?: P) => void;
  unmount: () => void;
};

/**
 * Mounts `useHook` inside a component that renders nothing, and exposes what it
 * returned. `result.current` is live: it is reassigned on each render, so read
 * it after the state change rather than destructuring it up front.
 *
 * `initialProps` feeds the hook's argument, so a test can change what identifies
 * the resource between renders — the case `useApiResource` cares most about.
 *
 * `wrapper` mounts the hook inside a tree, which is how a hook that reads
 * context is tested at all: it is rendered as a component, not called, so a
 * provider's own hooks and state work exactly as they do in the app.
 */
export function renderHook<T, P = void>(
  useHook: (props: P) => T,
  options?: {
    initialProps?: P;
    wrapper?: ComponentType<{ children: ReactNode }>;
  },
): RenderHookResult<T, P> {
  const result = { current: undefined as T };
  let props = options?.initialProps as P;

  function Probe(): ReactElement | null {
    result.current = useHook(props);
    return null;
  }

  const Wrapper = options?.wrapper ?? Fragment;
  const tree = () => (
    <Wrapper>
      <Probe />
    </Wrapper>
  );

  const root = createRoot();
  mounted.add(root);
  act(() => {
    root.render(tree());
  });

  return {
    result,
    rerender: (next?: P) => {
      if (next !== undefined) props = next;
      act(() => {
        root.render(tree());
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      mounted.delete(root);
    },
  };
}

/** Unmounts everything still mounted — call from `afterEach`. */
export function cleanup(): void {
  for (const root of mounted) {
    act(() => {
      root.unmount();
    });
  }
  mounted.clear();
}

/**
 * Retries `assertion` until it stops throwing, or gives up and rethrows the last
 * failure. Each wait is wrapped in `act` so React can flush the work an awaited
 * promise scheduled — without that, state updates land outside act and the
 * assertion sees a stale render.
 */
export async function waitFor(
  assertion: () => void,
  {
    timeout = 1000,
    interval = 10,
  }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;

  for (;;) {
    try {
      assertion();
      return;
    } catch (failure) {
      if (Date.now() >= deadline) throw failure;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, interval));
      });
    }
  }
}

export { act };
