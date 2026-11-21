/** `import x from "./file.sql" with { type: "text" }` gives the file's text. */
declare module "*.sql" {
  const text: string;
  export default text;
}
