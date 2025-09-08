import chalk from "chalk";

export function textWithColor(text: string, color: string): string {
  const colorFunc = (chalk as any)[color.toLowerCase()];
  if (typeof colorFunc === "function") {
    return colorFunc(text);
  } else {
    console.warn(`Color "${color}" is not supported. Using default color.`);
    return text;
  }
}
