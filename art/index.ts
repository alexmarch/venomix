import cfonts from "cfonts";

export function printLogo(title: string = "Venomix", subtitle: string = ""): void {
    cfonts.say(title, {
      font: "block",
      align: "left",
      colors: ["green", "red"],
      gradient: ['red', 'green'],
      background: "transparent",
      letterSpacing: 1,
      lineHeight: 1,
      space: false,
      maxLength: "0",
      independentGradient: true,
      transitionGradient: true,
      env: "node",
    });
    console.log(subtitle);
}
