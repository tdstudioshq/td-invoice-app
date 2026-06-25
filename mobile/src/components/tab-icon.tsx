import { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Tab bar icon that fills when the tab is focused and shows the outline
 * variant otherwise. Pass the filled base name (e.g. "grid"); the matching
 * "-outline" glyph is used for the inactive state.
 */
export function TabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: IoniconName;
  color: string;
  size: number;
  focused: boolean;
}) {
  const glyph = (focused ? name : `${name}-outline`) as IoniconName;
  return <Ionicons name={glyph} color={color} size={size} />;
}
