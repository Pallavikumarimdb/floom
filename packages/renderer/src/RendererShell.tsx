import React from 'react';
import type { OutputShape, RenderProps, RenderState } from './contract/index.js';
import { getDefaultOutput } from './outputs/index.js';
import { ErrorOutput } from './outputs/ErrorOutput.js';

/**
 * ErrorBoundary — catches render crashes in a custom renderer and falls back
 * to a stable default output. Every custom component is wrapped in this by
 * the host; default outputs are simple enough that they do not need it, but
 * it is safe to double-wrap.
 */
export class RendererErrorBoundary extends React.Component<
  {
    fallbackShape?: OutputShape;
    fallbackProps: RenderProps;
    children: React.ReactNode;
  },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[floom-renderer] custom renderer crashed, falling back:', error, info);
  }

  render() {
    if (this.state.error) {
      const Fallback = getDefaultOutput(this.props.fallbackShape || 'error');
      // If we fall back to the error renderer, surface the crash; otherwise
      // use the shape's default (e.g. table) so the user still sees the data.
      if (this.props.fallbackShape && this.props.fallbackShape !== 'error') {
        return <Fallback {...this.props.fallbackProps} />;
      }
      return (
        <ErrorOutput
          state="output-error"
          error={{
            message: this.state.error.message,
            code: 'renderer_crashed',
            details: { name: this.state.error.name },
          }}
        />
      );
    }
    return this.props.children as React.ReactElement;
  }
}

interface RendererShellProps extends RenderProps {
  /** The shape to render. Host picks this via pickOutputShape(schema). */
  shape: OutputShape;
  /**
   * Optional custom renderer component. When present + state is
   * 'output-available', we render this inside an ErrorBoundary that falls
   * back to the default for `shape`.
   */
  CustomRenderer?: React.ComponentType<RenderProps>;
}

/**
 * RendererShell — the top-level render entry point. Switches on RenderState,
 * looks up the default component for `shape`, and optionally wraps a custom
 * renderer in an ErrorBoundary.
 *
 * This is the ONLY component the host app needs to import for rendering. It
 * encapsulates the contract's three-state machine.
 */
export function RendererShell(props: RendererShellProps): React.ReactElement {
  const { state, shape, CustomRenderer, ...renderProps } = props;

  // Error state: always use the ErrorOutput default, ignoring custom renderers.
  if (state === 'output-error') {
    return <ErrorOutput {...renderProps} state="output-error" />;
  }

  const Default = getDefaultOutput(shape);

  // Input-available state: render the default in loading mode.
  if (state === 'input-available') {
    return <Default {...renderProps} state={state} loading={true} />;
  }

  // Output-available state: pick custom renderer if present, wrap in boundary.
  if (CustomRenderer) {
    return (
      <RendererErrorBoundary
        fallbackShape={shape}
        fallbackProps={{ ...renderProps, state }}
      >
        <CustomRenderer {...renderProps} state={state} />
      </RendererErrorBoundary>
    );
  }
  return <Default {...renderProps} state={state} />;
}

/**
 * Stable export for the state machine — useful for tests that don't want to
 * render React but still want to assert which default a given state resolves to.
 */
export function resolveRenderTarget(
  state: RenderState,
  shape: OutputShape,
  hasCustom: boolean,
): { component: 'custom' | 'default'; shape: OutputShape | 'error'; loading: boolean } {
  if (state === 'output-error') {
    return { component: 'default', shape: 'error', loading: false };
  }
  if (state === 'input-available') {
    return { component: 'default', shape, loading: true };
  }
  return { component: hasCustom ? 'custom' : 'default', shape, loading: false };
}
