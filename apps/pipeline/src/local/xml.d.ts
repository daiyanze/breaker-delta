/** `import x from "./file.xml" with { type: "text" }` gives the file's text. */
declare module "*.xml" {
  const text: string;
  export default text;
}
