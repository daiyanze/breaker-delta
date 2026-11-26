/** `import text from "./x.css" with { type: "text" }`: Bun gives the file's text. */
declare module "*.css" {
  const text: string;
  export default text;
}
