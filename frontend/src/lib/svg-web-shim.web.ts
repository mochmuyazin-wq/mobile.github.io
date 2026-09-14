// WEB-ONLY shim (Metro resolves this file instead of svg-web-shim.ts on web).
//
// react-native-gifted-charts attaches touchable props (onPress/onPressOut) to
// react-native-svg shapes. On web, react-native-svg's `prepare()` then forwards
// `onPressOut` raw plus injects 6 responder props onto the DOM element, which
// react-dom dev mode flags as "Unknown event handler property" console.errors —
// surfacing as the red LogBox overlay. LogBox cannot suppress errors, so we
// remove the touchable/responder props from every SVG shape on web instead.
// Trade-off: tap-to-focus on charts is disabled in the web preview; native is
// untouched (this file is not bundled there).

import * as Svg from "react-native-svg";

const STRIPPED_PROPS = [
  "onPress",
  "onPressIn",
  "onPressOut",
  "onLongPress",
  "onStartShouldSetResponder",
  "onMoveShouldSetResponder",
  "onResponderGrant",
  "onResponderMove",
  "onResponderRelease",
  "onResponderTerminate",
  "onResponderTerminationRequest",
  "onResponderReject",
];

function stripTouchableProps(props: Record<string, any> | undefined | null) {
  if (!props) return props;
  let hasAny = false;
  for (const key of STRIPPED_PROPS) {
    if (props[key] !== undefined) {
      hasAny = true;
      break;
    }
  }
  if (!hasAny) return props;
  const clean: Record<string, any> = {};
  for (const key in props) {
    if (!STRIPPED_PROPS.includes(key)) clean[key] = props[key];
  }
  return clean;
}

for (const exported of Object.values(Svg as Record<string, any>)) {
  if (typeof exported === "function" && typeof exported.prototype?.prepareProps === "function") {
    exported.prototype.prepareProps = stripTouchableProps;
  }
}
