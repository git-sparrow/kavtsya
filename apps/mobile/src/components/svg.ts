import type { ComponentType } from "react";
import SvgBase, {
  Circle as CircleBase,
  Defs as DefsBase,
  Ellipse as EllipseBase,
  Path as PathBase,
  RadialGradient as RadialGradientBase,
  Stop as StopBase,
  type CircleProps,
  type EllipseProps,
  type PathProps,
  type SvgProps,
} from "react-native-svg";

// react-native-svg declares its exports as classes, which React 19's stricter
// JSX element typing rejects (the same coercion customer-qr.tsx applies to
// react-native-qrcode-svg and scan-workstation.tsx to expo-camera). Do it once
// here so a future react-native-svg typing change touches one file, not every
// component that draws.
export const Svg = SvgBase as unknown as ComponentType<SvgProps>;
export const Path = PathBase as unknown as ComponentType<PathProps>;
export const Circle = CircleBase as unknown as ComponentType<CircleProps>;
export const Ellipse = EllipseBase as unknown as ComponentType<EllipseProps>;
export const Defs = DefsBase as unknown as ComponentType<{
  children: React.ReactNode;
}>;
export const RadialGradient = RadialGradientBase as unknown as ComponentType<
  Record<string, unknown>
>;
export const Stop = StopBase as unknown as ComponentType<
  Record<string, unknown>
>;
