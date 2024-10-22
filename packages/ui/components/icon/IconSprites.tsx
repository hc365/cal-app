import * as React from "react";
import SVG from "react-inlinesvg";

export function IconSprites() {
  return <SVG src={`/icons/sprite.svg?v=${process.env.NEXT_PUBLIC_CALCOM_VERSION}`} />;
}

export default IconSprites;
